package com.rairc.newscentralizer.widget

import android.content.Context
import org.json.JSONObject
import java.io.File

object WidgetPayloadStore {
  private const val FILE_NAME = "widget_payload.json"

  fun payloadFile(context: Context): File =
    File(context.filesDir, FILE_NAME)

  fun readUnread(context: Context): Int {
    return try {
      val text = payloadFile(context).readText(Charsets.UTF_8)
      JSONObject(text).optInt("unread", 0)
    } catch (_: Exception) {
      0
    }
  }
}
