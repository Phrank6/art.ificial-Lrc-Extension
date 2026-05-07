--[[----------------------------------------------------------------------------
XmpParser.lua
Lightweight XMP sidecar parser. Extracts a fixed set of Camera Raw develop
settings using string patterns -- no external XML library required.

Returned settings keys mirror the Lightroom SDK's developSettings names so the
result can be passed straight to photo:applyDevelopSettings().
------------------------------------------------------------------------------]]

local LrFileUtils = import "LrFileUtils"

local XmpParser = {}

-- Numeric "crs:" attributes we know how to apply. Map: XMP key -> SDK key.
local NUMERIC_KEYS = {
    Exposure2012   = "Exposure2012",
    Contrast2012   = "Contrast2012",
    Highlights2012 = "Highlights2012",
    Shadows2012    = "Shadows2012",
    Whites2012     = "Whites2012",
    Blacks2012     = "Blacks2012",
    Temperature    = "Temperature",
    Tint           = "Tint",
    Vibrance       = "Vibrance",
    Saturation     = "Saturation",
    CropTop        = "CropTop",
    CropLeft       = "CropLeft",
    CropBottom     = "CropBottom",
    CropRight      = "CropRight",
    CropAngle      = "CropAngle",
}

-- Keys that imply crop intent.
local CROP_KEYS = {
    CropTop   = true,
    CropLeft  = true,
    CropBottom = true,
    CropRight = true,
    CropAngle = true,
}

------------------------------------------------------------------------
-- File helpers
------------------------------------------------------------------------

local function readFile(path)
    local f, err = io.open(path, "rb")
    if not f then
        return nil, err or "could not open file"
    end
    local content = f:read("*all")
    f:close()
    if not content then
        return nil, "could not read file content"
    end
    return content
end

------------------------------------------------------------------------
-- Pattern helpers
------------------------------------------------------------------------

-- XMP allows a key to appear either as an XML attribute:
--     crs:Exposure2012="+0.50"
-- or as a child element:
--     <crs:Exposure2012>+0.50</crs:Exposure2012>
local function findValue(xmp, key)
    -- Attribute form
    local v = xmp:match('crs:' .. key .. '%s*=%s*"([^"]*)"')
    if v then return v end
    -- Element form
    v = xmp:match('<crs:' .. key .. '[^>]*>%s*([^<]-)%s*</crs:' .. key .. '>')
    return v
end

local function parseNumber(raw)
    if raw == nil then return nil end
    -- XMP often writes leading "+" on signed values, e.g. "+0.50"
    raw = raw:gsub("^%+", "")
    return tonumber(raw)
end

local function parseBool(raw)
    if raw == nil then return nil end
    local lower = string.lower(raw)
    if lower == "true" or lower == "1" then return true end
    if lower == "false" or lower == "0" then return false end
    return nil
end

------------------------------------------------------------------------
-- Public API
------------------------------------------------------------------------

--- Parse the XMP sidecar at xmpPath.
-- Returns: settings (table) on success, or nil + error message on failure.
-- A third return value gives the count of recognised keys that were applied.
function XmpParser.parse(xmpPath)
    if type(xmpPath) ~= "string" or xmpPath == "" then
        return nil, "invalid path"
    end

    if LrFileUtils.exists(xmpPath) ~= "file" then
        return nil, "XMP sidecar does not exist: " .. tostring(xmpPath)
    end

    local content, readErr = readFile(xmpPath)
    if not content then
        return nil, "failed to read XMP: " .. tostring(readErr)
    end

    -- Quick sanity check: file should look like an XMP packet.
    if not (content:find("<x:xmpmeta", 1, true) or content:find("<rdf:RDF", 1, true)) then
        return nil, "file does not appear to be a valid XMP sidecar"
    end

    local settings = {}
    local count = 0
    local hasCropAdjustment = false

    for xmpKey, sdkKey in pairs(NUMERIC_KEYS) do
        local raw = findValue(content, xmpKey)
        local n = parseNumber(raw)
        if n ~= nil then
            settings[sdkKey] = n
            count = count + 1
            if CROP_KEYS[xmpKey] then
                hasCropAdjustment = true
            end
        end
    end

    -- Honour an explicit HasCrop attribute if present, otherwise infer from
    -- whether any crop values were supplied.
    local explicitHasCrop = parseBool(findValue(content, "HasCrop"))
    if explicitHasCrop ~= nil then
        settings.HasCrop = explicitHasCrop
    elseif hasCropAdjustment then
        settings.HasCrop = true
    end

    if count == 0 then
        return nil, "no recognised crs:* develop settings found in XMP"
    end

    return settings, nil, count
end

return XmpParser
