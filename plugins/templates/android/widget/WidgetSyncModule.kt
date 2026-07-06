package com.rairc.newscentralizer.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.FileOutputStream

class WidgetSyncModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NewsCentralizerWidgetSync"

  @ReactMethod
  fun updateWidgetData(json: String) {
    val ctx = reactApplicationContext.applicationContext
    try {
      val f = WidgetPayloadStore.payloadFile(ctx)
      FileOutputStream(f).use { out ->
        out.write(json.toByteArray(Charsets.UTF_8))
      }
    } catch (_: Exception) {
      return
    }
    refreshAllWidgets(ctx)
  }

  companion object {
    fun refreshAllWidgets(context: Context) {
      val mgr = AppWidgetManager.getInstance(context)
      val cn = ComponentName(context, NewsCentralizerWidget::class.java)
      val ids = mgr.getAppWidgetIds(cn)
      for (id in ids) {
        NewsCentralizerWidget.updateWidget(context, mgr, id)
      }
    }
  }
}
