//! JNI entry points for the FIPS Android library.
//!
//! Kotlin class: `com.fips.android.FipsVpnService`
//!
//! Load with: `System.loadLibrary("fips_jni")`

mod bridge;
mod tun_android;

use jni::objects::{JClass, JString};
use jni::sys::{jint, jstring};
use jni::JNIEnv;

/// Initialize logging. Called once when the shared library is loaded.
///
/// On Android, stderr is captured to logcat (tag: "fips"). We use
/// tracing_subscriber's fmt layer which writes to stderr. This avoids
/// needing a separate android_logger → tracing bridge for Phase 1.
#[unsafe(no_mangle)]
pub extern "C" fn JNI_OnLoad(_vm: jni::JavaVM, _: *mut std::ffi::c_void) -> jint {
    let _ = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::DEBUG)
        .with_ansi(false) // logcat doesn't render ANSI escapes
        .try_init();      // ignore error if already initialized

    jni::sys::JNI_VERSION_1_6
}

/// Start the FIPS mesh node.
///
/// ```kotlin
/// external fun startFips(tunFd: Int, dataDir: String, configYaml: String)
/// ```
#[unsafe(no_mangle)]
#[allow(non_snake_case)]
pub extern "C" fn Java_com_fips_android_FipsVpnService_startFips(
    mut env: JNIEnv,
    _class: JClass,
    tun_fd: jint,
    data_dir: JString,
    config_yaml: JString,
) {
    let data_dir: String = env
        .get_string(&data_dir)
        .map(Into::into)
        .unwrap_or_default();

    let config_yaml: String = env
        .get_string(&config_yaml)
        .map(Into::into)
        .unwrap_or_default();

    if let Err(e) = bridge::start(tun_fd, &data_dir, &config_yaml) {
        tracing::error!("startFips failed: {e:#}");
        let _ = env.throw_new("java/lang/RuntimeException", e.to_string());
    }
}

/// Stop the FIPS mesh node.
///
/// ```kotlin
/// external fun stopFips()
/// ```
#[unsafe(no_mangle)]
#[allow(non_snake_case)]
pub extern "C" fn Java_com_fips_android_FipsVpnService_stopFips(
    _env: JNIEnv,
    _class: JClass,
) {
    bridge::stop();
}

/// Return node status as a JSON string.
///
/// ```kotlin
/// external fun getStatus(): String
/// ```
#[unsafe(no_mangle)]
#[allow(non_snake_case)]
pub extern "C" fn Java_com_fips_android_FipsVpnService_getStatus<'local>(
    env: JNIEnv<'local>,
    _class: JClass<'local>,
) -> jstring {
    let json = bridge::status_json();
    env.new_string(json)
        .map(|s| s.into_raw())
        .unwrap_or(std::ptr::null_mut())
}
