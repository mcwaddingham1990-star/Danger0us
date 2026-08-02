package com.danger0us.securitywatch

/**
 * Settings apps vary a lot by OEM (Samsung, MIUI, ColorOS, ...), so exact
 * activity/fragment class names aren't reliable across devices. Instead we
 * pair a known settings-ish package with keywords found in the class name
 * or the window's title text, which stays stable across skins.
 */
object SensitiveScreenDetector {

    private val sensitivePackages = setOf(
        "com.android.settings",
        "com.android.permissioncontroller",
        "com.google.android.permissioncontroller",
        "com.android.settings.intelligence",
        "com.samsung.android.settings",
        "com.samsung.android.permissioncontroller",
        "com.miui.securitycenter",
        "com.miui.permcenter",
        "com.coloros.safecenter",
        "com.oppo.safe",
        "com.oplus.appdetail",
        "com.huawei.systemmanager"
    )

    // Order matters: first matching keyword wins, so more specific reasons come first.
    private val keywordReasons = linkedMapOf(
        "accessibility" to "Accessibility settings opened",
        "device admin" to "Device admin apps opened",
        "deviceadmin" to "Device admin apps opened",
        "usage access" to "Usage access settings opened",
        "notification access" to "Notification access settings opened",
        "special app access" to "Special app access opened",
        "install unknown apps" to "\"Install unknown apps\" settings opened",
        "manage applications" to "App management screen opened",
        "app info" to "App info / permissions screen opened",
        "permission" to "App permissions screen opened"
    )

    /** Returns a human-readable reason if this screen is sensitive, or null otherwise. */
    fun match(packageName: String, className: String, titleText: String): String? {
        if (packageName !in sensitivePackages) return null

        val haystack = (className + " " + titleText).lowercase()
        for ((keyword, reason) in keywordReasons) {
            if (haystack.contains(keyword)) return reason
        }
        return null
    }
}
