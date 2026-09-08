package expo.modules.gustsmotion

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class GustsMotionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GustsMotion")
    Events("onAccelerometerData")

    OnCreate {
      instance = this@GustsMotionModule
    }

    OnDestroy {
      instance = null
    }

    Function("start") {
      val context = appContext.reactContext ?: return@Function
      context.startForegroundService(Intent(context, GustsMotionService::class.java))
    }

    Function("stop") {
      val context = appContext.reactContext ?: return@Function
      context.stopService(Intent(context, GustsMotionService::class.java))
    }
  }

  companion object {
    var instance: GustsMotionModule? = null

    fun emit(x: Double, y: Double, z: Double, timestamp: Double) {
      instance?.sendEvent(
        "onAccelerometerData",
        mapOf("x" to x, "y" to y, "z" to z, "timestamp" to timestamp)
      )
    }
  }
}
