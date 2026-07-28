LOCAL_PATH := $(call my-dir)

ifeq ($(TARGET_ARCH_ABI),armeabi-v7a)

include $(CLEAR_VARS)
LOCAL_MODULE := bytehook
LOCAL_SRC_FILES := /root/.gradle/caches/8.13/transforms/3c679b3fe5c38e16e5895ad8481fe122/transformed/bytehook-1.0.10/prefab/modules/bytehook/libs/android.armeabi-v7a/libbytehook.so
LOCAL_EXPORT_C_INCLUDES := /root/.gradle/caches/8.13/transforms/3c679b3fe5c38e16e5895ad8481fe122/transformed/bytehook-1.0.10/prefab/modules/bytehook/include
LOCAL_EXPORT_SHARED_LIBRARIES :=
LOCAL_EXPORT_STATIC_LIBRARIES :=
LOCAL_EXPORT_LDLIBS :=
include $(PREBUILT_SHARED_LIBRARY)

endif  # armeabi-v7a

