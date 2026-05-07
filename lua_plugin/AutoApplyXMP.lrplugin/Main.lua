--[[----------------------------------------------------------------------------
Main.lua
Entry point for "Auto-Apply XMP from Folder".

Flow:
  1. Ask the user to pick a folder.
  2. Enumerate JPEG / PNG / TIFF files in that folder.
  3. For every image whose base filename has a matching .xmp sidecar:
        a. Make sure the image is in the active catalog (import if missing).
        b. Parse the XMP for known crs:* develop parameters.
        c. Apply those settings to the photo via photo:applyDevelopSettings().
  4. Show a summary dialog (and a per-photo error log if anything failed).
------------------------------------------------------------------------------]]

local LrApplication    = import "LrApplication"
local LrDialogs        = import "LrDialogs"
local LrFileUtils      = import "LrFileUtils"
local LrFunctionContext = import "LrFunctionContext"
local LrPathUtils      = import "LrPathUtils"
local LrProgressScope  = import "LrProgressScope"
local LrTasks          = import "LrTasks"
local LrLogger         = import "LrLogger"

local XmpParser = require "XmpParser"

------------------------------------------------------------------------
-- Logging (writes to ~/Documents/LrClassicLogs/AutoApplyXMP.log)
------------------------------------------------------------------------
local logger = LrLogger("AutoApplyXMP")
logger:enable("logfile")

local function logf(fmt, ...)
    logger:trace(string.format(fmt, ...))
end

------------------------------------------------------------------------
-- File helpers
------------------------------------------------------------------------

local IMAGE_EXTENSIONS = {
    jpg  = true,
    jpeg = true,
    png  = true,
    tif  = true,
    tiff = true,
}

local function isSupportedImage(path)
    local ext = LrPathUtils.extension(path)
    if not ext or ext == "" then return false end
    return IMAGE_EXTENSIONS[string.lower(ext)] == true
end

local function findImagesInFolder(folderPath)
    local images = {}
    -- LrFileUtils.files iterates the immediate children (non-recursive).
    -- Use LrFileUtils.recursiveFiles instead if recursive scanning is desired.
    for filePath in LrFileUtils.files(folderPath) do
        if isSupportedImage(filePath) then
            table.insert(images, filePath)
        end
    end
    table.sort(images)
    return images
end

local function getMatchingXmpPath(imagePath)
    -- photo001.jpg -> photo001.xmp (case-insensitive on extension)
    local xmpPath = LrPathUtils.replaceExtension(imagePath, "xmp")
    if LrFileUtils.exists(xmpPath) == "file" then
        return xmpPath
    end
    -- Fallback: try uppercase .XMP variant on case-sensitive file systems.
    local xmpUpper = LrPathUtils.replaceExtension(imagePath, "XMP")
    if LrFileUtils.exists(xmpUpper) == "file" then
        return xmpUpper
    end
    return nil
end

------------------------------------------------------------------------
-- Catalog operations
------------------------------------------------------------------------

-- Returns: photo (LrPhoto or nil), wasImported (boolean), errMsg (string or nil)
local function ensurePhotoInCatalog(catalog, imagePath)
    local existing = catalog:findPhotoByPath(imagePath)
    if existing then
        return existing, false, nil
    end

    local addedPhoto, captureErr
    local ok, callErr = LrTasks.pcall(function()
        catalog:withWriteAccessDo(
            "Import " .. LrPathUtils.leafName(imagePath),
            function()
                local success, photoOrErr = pcall(function()
                    return catalog:addPhoto({ path = imagePath })
                end)
                if success then
                    addedPhoto = photoOrErr
                else
                    captureErr = tostring(photoOrErr)
                end
            end,
            { timeout = 30 }
        )
    end)

    if not ok then
        return nil, false, "write-access failed: " .. tostring(callErr)
    end
    if captureErr then
        return nil, false, "addPhoto failed: " .. captureErr
    end
    if not addedPhoto then
        return nil, false, "addPhoto returned no photo (possibly unsupported file type or already linked elsewhere)"
    end
    return addedPhoto, true, nil
end

local function applyDevelopSettings(catalog, photo, settings, label)
    local applyErr
    local ok, callErr = LrTasks.pcall(function()
        catalog:withWriteAccessDo(
            "Apply XMP: " .. label,
            function()
                local success, err = pcall(function()
                    photo:applyDevelopSettings(settings)
                end)
                if not success then
                    applyErr = tostring(err)
                end
            end,
            { timeout = 30 }
        )
    end)

    if not ok then
        return false, "write-access failed: " .. tostring(callErr)
    end
    if applyErr then
        return false, "applyDevelopSettings failed: " .. applyErr
    end
    return true, nil
end

------------------------------------------------------------------------
-- Main routine
------------------------------------------------------------------------

local function runAutoApply(context)

    -- 1. Folder picker
    local folderResult = LrDialogs.runOpenPanel({
        title                   = "Select folder containing images and XMP sidecars",
        prompt                  = "Choose Folder",
        canChooseFiles          = false,
        canChooseDirectories    = true,
        allowsMultipleSelection = false,
    })

    if not folderResult or #folderResult == 0 then
        return -- user canceled
    end

    local folderPath = folderResult[1]
    logf("Selected folder: %s", folderPath)

    -- 2. Enumerate images
    local images = findImagesInFolder(folderPath)
    if #images == 0 then
        LrDialogs.message(
            "No images found",
            "No supported image files (JPEG, PNG, TIFF) were found in the selected folder.",
            "info"
        )
        return
    end

    -- 3. Pair images with their XMP sidecars
    local pairsToProcess = {}
    local skippedNoXmp = 0
    for _, imagePath in ipairs(images) do
        local xmp = getMatchingXmpPath(imagePath)
        if xmp then
            table.insert(pairsToProcess, { image = imagePath, xmp = xmp })
        else
            skippedNoXmp = skippedNoXmp + 1
        end
    end

    if #pairsToProcess == 0 then
        LrDialogs.message(
            "No matching XMP sidecars",
            string.format(
                "Found %d image(s), but none had a matching .xmp sidecar with the same base name.",
                #images
            ),
            "info"
        )
        return
    end

    local catalog = LrApplication.activeCatalog()

    -- 4. Progress scope (auto-cleaned via function context)
    local progress = LrProgressScope({
        title            = "Auto-Apply XMP from Folder",
        caption          = string.format("Preparing %d photo(s)...", #pairsToProcess),
        functionContext  = context,
    })
    progress:setCancelable(true)

    local processed   = 0
    local imported    = 0
    local malformed   = 0
    local conflicts   = 0
    local errors      = {}

    for i, item in ipairs(pairsToProcess) do
        if progress:isCanceled() then
            logf("User canceled at %d/%d", i, #pairsToProcess)
            break
        end

        local imageName = LrPathUtils.leafName(item.image)
        progress:setCaption(string.format("Processing %s (%d/%d)", imageName, i, #pairsToProcess))

        -- Parse XMP first; if it's malformed we skip the import work entirely.
        local settings, parseErr, settingCount = XmpParser.parse(item.xmp)
        if not settings then
            malformed = malformed + 1
            table.insert(errors, string.format("%s: %s", imageName, tostring(parseErr)))
            logf("Malformed XMP for %s: %s", imageName, tostring(parseErr))
        else
            local photo, wasImported, importErr = ensurePhotoInCatalog(catalog, item.image)
            if not photo then
                if importErr and importErr:lower():find("write") then
                    conflicts = conflicts + 1
                end
                table.insert(errors, string.format("%s: %s", imageName, tostring(importErr)))
                logf("Import failed for %s: %s", imageName, tostring(importErr))
            else
                if wasImported then imported = imported + 1 end

                local ok, applyErr = applyDevelopSettings(catalog, photo, settings, imageName)
                if ok then
                    processed = processed + 1
                    logf("Applied %d setting(s) to %s%s",
                        settingCount or 0,
                        imageName,
                        wasImported and " (newly imported)" or ""
                    )
                else
                    if applyErr and applyErr:lower():find("write") then
                        conflicts = conflicts + 1
                    end
                    table.insert(errors, string.format("%s: %s", imageName, tostring(applyErr)))
                    logf("Apply failed for %s: %s", imageName, tostring(applyErr))
                end
            end
        end

        progress:setPortionComplete(i, #pairsToProcess)
        -- Yield occasionally so the UI stays responsive.
        if i % 5 == 0 then LrTasks.yield() end
    end

    progress:done()

    -- 5. Summary
    local summary = string.format(
        "Auto-Apply XMP complete.\n\n" ..
        "Photos with develop settings applied: %d\n" ..
        "Newly imported into catalog:          %d\n" ..
        "Skipped (no matching XMP):            %d\n" ..
        "Malformed XMP files:                  %d\n" ..
        "Write-access conflicts:               %d\n" ..
        "Other errors:                         %d",
        processed,
        imported,
        skippedNoXmp,
        malformed,
        conflicts,
        math.max(0, #errors - malformed - conflicts)
    )

    if #errors > 0 then
        -- Trim very long error lists so the dialog stays readable.
        local maxShow = 20
        local shown = {}
        for i = 1, math.min(maxShow, #errors) do
            shown[i] = errors[i]
        end
        local detail = table.concat(shown, "\n")
        if #errors > maxShow then
            detail = detail .. string.format("\n... and %d more (see plug-in log).", #errors - maxShow)
        end
        LrDialogs.message("Auto-Apply XMP", summary .. "\n\nErrors:\n" .. detail, "info")
    else
        LrDialogs.message("Auto-Apply XMP", summary, "info")
    end
end

------------------------------------------------------------------------
-- Bootstrap (must run on an async task; SDK-required entry pattern)
------------------------------------------------------------------------

LrTasks.startAsyncTask(function()
    LrFunctionContext.callWithContext("AutoApplyXMP.run", function(context)
        local ok, err = LrTasks.pcall(runAutoApply, context)
        if not ok then
            logf("Top-level error: %s", tostring(err))
            LrDialogs.message(
                "Auto-Apply XMP",
                "Plug-in stopped because of an unexpected error:\n\n" .. tostring(err),
                "critical"
            )
        end
    end)
end)
