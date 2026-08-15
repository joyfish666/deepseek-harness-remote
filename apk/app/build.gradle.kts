plugins {
    id("com.android.application")
}

android {
    namespace = "dev.dsh.remote"
    compileSdk = 35

    defaultConfig {
        applicationId = "dev.dsh.remote"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }
}
