package com.local.legends

import android.view.WindowManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Holds the screen on while live scoring is in progress.
 *
 * A scoring session is minutes of watching between taps, so the device lock
 * timeout fires constantly and every delivery costs the scorer an unlock. The
 * flag lives on the Activity window, so it can only be set from native.
 *
 * Deliberately not a whole-app setting: ScoringScreen releases it when the match
 * completes and on unmount, so nothing else in the app burns the battery.
 */
class KeepAwakeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = NAME

    private fun setKeepScreenOn(on: Boolean) {
        val activity = currentActivity ?: return
        // Window flags must be touched on the UI thread; @ReactMethod calls arrive
        // on the native modules thread.
        activity.runOnUiThread {
            if (on) {
                activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
    }

    @ReactMethod
    fun activate() = setKeepScreenOn(true)

    @ReactMethod
    fun deactivate() = setKeepScreenOn(false)

    companion object {
        const val NAME = "KeepAwake"
    }
}
