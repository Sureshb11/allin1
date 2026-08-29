package com.local.legends

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.common.assets.ReactFontManager
import com.facebook.soloader.SoLoader
class MainApplication : Application(), ReactApplication {

    override val reactNativeHost: ReactNativeHost =
        object : DefaultReactNativeHost(this) {
            override fun getPackages(): List<ReactPackage> =
                PackageList(this).packages.apply {
                    // Packages that cannot be autolinked yet can be added manually here
                    // KeepAwake is app-local (holds the screen on while scoring),
                    // so there is nothing for the autolinker to find.
                    add(KeepAwakePackage())
                }

            override fun getJSMainModuleName(): String = "index"

            override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

            override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
            override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
        }

    override val reactHost: ReactHost
        get() = getDefaultReactHost(applicationContext, reactNativeHost)

    override fun onCreate() {
        super.onCreate()
        // Register the Selawik font family (res/font/selawik.xml) so JS `fontFamily:
        // 'selawik'` resolves with full 100–900 weight support (Selawik is the open,
        // metric-compatible twin of Segoe UI). res/font XML fonts are NOT auto-resolved
        // by RN — they must be registered here, else text falls back to the system
        // font, giving a non-uniform look app-wide.
        ReactFontManager.getInstance().addCustomFont(this, "selawik", R.font.selawik)
        createNotificationChannel()
        SoLoader.init(this, false)
        if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
            // If you opted-in for the New Architecture, we load the native entry point for this app.
            load()
        }
    }

    /**
     * The notification channel every push names.
     *
     * AndroidManifest declares `default_notification_channel_id = "default"` and
     * the server sends `android.notification.channelId = "default"` — but nothing
     * ever created a channel with that id. On Android 8+ the system drops a
     * notification whose channel does not exist, so a push only ever showed up
     * while the app was in the foreground, where JS draws its own banner and the
     * system is not involved. Closed app, nothing.
     *
     * Created HERE rather than from JS on purpose: when the app is killed, FCM
     * starts this process to deliver the message and Application.onCreate runs —
     * JS does not. A channel created in JS would only exist after someone had
     * already opened the app, which is precisely the case that already worked.
     *
     * Creating a channel that already exists is a no-op, but the id is checked
     * first so a user who has turned this channel down does not have their
     * choice quietly reset on the next launch.
     */
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Match & social updates",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Live scores and results, and when someone follows you or reacts to your posts."
            enableVibration(true)
            setShowBadge(true)
        }
        manager.createNotificationChannel(channel)
    }

    companion object {
        /** Must match the manifest meta-data AND backend lib/push.js. */
        private const val CHANNEL_ID = "default"
    }
}
