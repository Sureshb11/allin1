package com.local.legends

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/** Registered by hand in MainApplication — an app-local module, nothing to autolink. */
class KeepAwakePackage : ReactPackage {

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(KeepAwakeModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<out View, *>> =
        emptyList()
}
