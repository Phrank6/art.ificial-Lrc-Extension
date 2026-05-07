--[[----------------------------------------------------------------------------
Info.lua
Plugin manifest for "Auto-Apply XMP from Folder"
------------------------------------------------------------------------------]]

return {

    LrSdkVersion        = 6.0,
    LrSdkMinimumVersion = 6.0,

    LrToolkitIdentifier = "com.example.autoapplyxmp",
    LrPluginName        = "Auto-Apply XMP from Folder",

    -- Adds: Library menu > Plug-in Extras > Auto-Apply XMP from Folder
    LrLibraryMenuItems = {
        {
            title = "Auto-Apply XMP from Folder...",
            file  = "Main.lua",
        },
    },

    -- Adds: File menu > Plug-in Extras > Auto-Apply XMP from Folder
    LrExportMenuItems = {
        {
            title = "Auto-Apply XMP from Folder...",
            file  = "Main.lua",
        },
    },

    VERSION = { major = 1, minor = 0, revision = 0, build = 1 },

}
