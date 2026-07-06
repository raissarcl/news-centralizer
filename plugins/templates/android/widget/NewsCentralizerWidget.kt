package com.rairc.newscentralizer.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import com.rairc.newscentralizer.R

class NewsCentralizerWidget : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    for (id in appWidgetIds) {
      updateWidget(context, appWidgetManager, id)
    }
  }

  companion object {
    fun updateWidget(
      context: Context,
      appWidgetManager: AppWidgetManager,
      appWidgetId: Int,
    ) {
      val unread = WidgetPayloadStore.readUnread(context)
      val views = RemoteViews(context.packageName, R.layout.widget_unread)
      views.setTextViewText(
        R.id.widget_unread_count,
        if (unread > 0) unread.toString() else "0"
      )
      views.setTextViewText(
        R.id.widget_unread_label,
        context.getString(R.string.widget_unread_label)
      )

      val intent = Intent(Intent.ACTION_VIEW, Uri.parse("newscentralizer://timeline?filter=unread"))
      intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      val pending = PendingIntent.getActivity(
        context,
        0,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      views.setOnClickPendingIntent(R.id.widget_root, pending)

      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
  }
}
