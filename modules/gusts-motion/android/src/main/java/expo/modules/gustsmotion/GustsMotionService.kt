package expo.modules.gustsmotion

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

class GustsMotionService : Service(), SensorEventListener {
  private var sensorManager: SensorManager? = null
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onCreate() {
    super.onCreate()
    startForegroundNotification()

    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "GUSTS::MotionWakeLock")
    wakeLock?.acquire(6 * 60 * 60 * 1000L)

    sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
    val acelerometro = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    sensorManager?.registerListener(this, acelerometro, SensorManager.SENSOR_DELAY_GAME)
  }

  private fun startForegroundNotification() {
    val channelId = "gusts_motion_channel"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        channelId, "Sesión GUSTS", NotificationManager.IMPORTANCE_LOW
      )
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(channel)
    }
    val notification = NotificationCompat.Builder(this, channelId)
      .setContentTitle("GUSTS está midiendo tu sesión")
      .setContentText("Saltos y velocidad activos")
      .setSmallIcon(android.R.drawable.ic_menu_compass)
      .build()
    startForeground(2025, notification)
  }

  override fun onSensorChanged(event: SensorEvent?) {
    event ?: return
    GustsMotionModule.emit(
      event.values[0].toDouble(),
      event.values[1].toDouble(),
      event.values[2].toDouble(),
      event.timestamp.toDouble()
    )
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

  override fun onDestroy() {
    sensorManager?.unregisterListener(this)
    wakeLock?.let { if (it.isHeld) it.release() }
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    return START_STICKY
  }
}
