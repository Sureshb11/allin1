# ProGuard/R8 rules for release builds
# Keep React Native and Hermes bridging classes
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.react.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.th3rdwave.safeareacontext.** { *; }
-keep class com.swmansion.rnscreens.** { *; }
-keep class com.oblador.vectoricons.** { *; }

# Keep annotations
-keepattributes *Annotation*

# Parcelable and JSON models
-keepclassmembers class * implements android.os.Parcelable { public static final android.os.Parcelable$Creator *; }
-keepclassmembers enum * { **[] $VALUES; public *; }

# Prevent obfuscation issues with React Native DevSupport (if present)
-dontwarn com.facebook.react.**
-dontwarn com.facebook.hermes.**
