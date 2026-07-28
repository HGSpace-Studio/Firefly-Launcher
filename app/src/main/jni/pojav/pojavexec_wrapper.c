/*
 * pojavexec_wrapper.c
 *
 * This library acts as a shim between lwjgl-glfw-classes.jar's GLFW class
 * and libpgw.so. The GLFW class calls System.loadLibrary("pojavexec"), but
 * the actual native implementations are in libpgw.so (which has different
 * function names). This wrapper:
 *
 * 1. Loads libpgw.so via JNI_OnLoad (with RTLD_GLOBAL)
 * 2. Implements missing JNI methods that libpgw.so doesn't have but GLFW expects
 * 3. Forwards pojav* function lookups via RTLD_DEFAULT
 */

#include <dlfcn.h>
#include <android/log.h>
#include <jni.h>

#define LOG_TAG "pojavexec_wrapper"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

static JavaVM *g_vm = NULL;

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *reserved) {
    g_vm = vm;
    LOGI("pojavexec_wrapper: JNI_OnLoad, loading libpgw.so");
    void *handle = dlopen("libpgw.so", RTLD_NOW | RTLD_GLOBAL);
    if (!handle) {
        LOGE("pojavexec_wrapper: failed to dlopen libpgw.so: %s", dlerror());
    } else {
        LOGI("pojavexec_wrapper: libpgw.so loaded successfully");
    }
    return JNI_VERSION_1_6;
}

/*
 * GLFW.nativeInitializeGLFWNativeBridge()V
 * Called by GLFW.<clinit> at line 561
 * This method is declared in lwjgl-glfw-classes.jar's GLFW class but
 * libpgw.so doesn't have a corresponding JNI implementation.
 * It's likely a bridge initialization method - we make it a no-op since
 * pgw handles bridge initialization through its own mechanism.
 */
JNIEXPORT void JNICALL
Java_org_lwjgl_glfw_GLFW_nativeInitializeGLFWNativeBridge(JNIEnv *env, jclass clazz) {
    LOGI("pojavexec_wrapper: nativeInitializeGLFWNativeBridge called (no-op)");
}

/*
 * CallbackBridge.nativeGetAndroidDPI()F
 * Called by GLFW.<clinit> at line 1579
 * Returns Android display DPI. Default to a reasonable value (160 = mdpi).
 */
JNIEXPORT jfloat JNICALL
Java_org_lwjgl_glfw_CallbackBridge_nativeGetAndroidDPI(JNIEnv *env, jclass clazz) {
    // Try to get actual DPI from Android
    float dpi = 160.0f; // Default mdpi
    JNIEnv *jni_env = NULL;
    if (g_vm) {
        (*g_vm)->AttachCurrentThread(g_vm, &jni_env, NULL);
    }
    // For now, return default. Could be enhanced with actual DisplayMetrics.
    LOGI("pojavexec_wrapper: nativeGetAndroidDPI returning %.1f", dpi);
    return dpi;
}

/*
 * GLFW.internalWindowSizeChanged(I I I)V
 * Called from native code (libpgw.so) to notify Java of window size changes.
 * This was the method causing NoSuchMethodError before - we provide it here.
 * Actually this is called FROM native TO java, so we don't need to implement it here.
 * The issue was that libpgw.so's JNI code looks for this method in the GLFW class.
 * As long as lwjgl-glfw-classes.jar has it, it should work.
 */
