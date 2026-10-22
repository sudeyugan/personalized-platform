package com.yiyu.mobile;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.widget.RemoteViews;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
import org.json.JSONArray;

/** Local bundled art only. No record database, key bridge, network or microphone. */
public class CompanionWidget extends AppWidgetProvider {
    protected boolean desk() { return false; }

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) render(context, manager, id);
    }

    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        render(context, manager, id);
    }

    private void render(Context context, AppWidgetManager manager, int id) {
        RemoteViews view = new RemoteViews(context.getPackageName(), desk() ? R.layout.companion_desk_widget : R.layout.companion_widget);
        Bitmap sheet = artwork(context);
        if (sheet != null) {
            try (InputStream input = context.getAssets().open("companion-atlas.json")) {
                byte[] bytes = new byte[4097];
                int length = 0, count;
                while ((count = input.read(bytes, length, bytes.length - length)) > 0) {
                    length += count;
                    if (length > 4096) throw new IOException("atlas metadata size");
                }
                if (length < 1) throw new IOException("atlas metadata size");
                JSONObject atlas = new JSONObject(new String(bytes, 0, length, StandardCharsets.UTF_8));
                JSONArray frames = atlas.getJSONArray("frames");
                if (sheet.getWidth() != atlas.getInt("width") || sheet.getHeight() != atlas.getInt("height") || frames.length() != 8) throw new IOException("atlas dimensions");
                JSONObject frame = frames.getJSONObject(desk() ? 5 : 0);
                int x = frame.getInt("x"), y = frame.getInt("y"), width = frame.getInt("width"), height = frame.getInt("height");
                if (x < 0 || y < 0 || width < 1 || height < 1 || x > sheet.getWidth() || y > sheet.getHeight() || width > sheet.getWidth() - x || height > sheet.getHeight() - y) throw new IOException("atlas frame");
                view.setImageViewBitmap(R.id.widget_character, Bitmap.createBitmap(sheet, x, y, width, height));
            } catch (IOException | org.json.JSONException ignored) { /* Keep the safe app-open action. */ }
        }
        Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent action = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        view.setOnClickPendingIntent(R.id.widget_root, action);
        manager.updateAppWidget(id, view);
    }

    private Bitmap artwork(Context context) {
        try {
            String[] files = context.getAssets().list("web/assets");
            if (files != null) for (String file : files) {
                if (!file.startsWith("mobile-companion-v2-") || !file.endsWith(".png")) continue;
                try (InputStream input = context.getAssets().open("web/assets/" + file)) {
                    return BitmapFactory.decodeStream(input);
                }
            }
        } catch (IOException ignored) { /* The bundled asset was unavailable; keep the app-open action. */ }
        return null;
    }
}
