package com.yiyu.mobile;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.MotionEvent;
import android.view.View;

final class PetView extends View {
    interface Drag { void move(int x, int y, boolean dock); }
    private Bitmap bitmap;
    private final Paint paint = new Paint();
    private final RectF bounds = new RectF();
    private final Runnable click, hide;
    private final Drag drag;
    private final ValueAnimator idle;
    private float breathe, startX, startY;
    private int originX, originY;
    private long downAt;
    PetView(Context context, Runnable click, Runnable hide, Drag drag) {
        super(context); this.click = click; this.hide = hide; this.drag = drag;
        try (java.io.InputStream input = context.getAssets().open("pet.png")) {
            BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize = 4;
            bitmap = BitmapFactory.decodeStream(input, null, options);
        } catch (Exception ignored) { }
        setContentDescription("小鱼，点击聊天，拖动移动，长按收起");
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_YES);
        idle = ValueAnimator.ofFloat(0, 1, 0);
        idle.setDuration(5000); idle.setRepeatCount(ValueAnimator.INFINITE);
        idle.addUpdateListener(animation -> { breathe = (float) animation.getAnimatedValue(); invalidate(); });
        idle.start();
    }
    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (bitmap == null) return;
        float offset = getHeight() * .009f * breathe;
        bounds.set(0, offset, getWidth(), getHeight());
        canvas.drawBitmap(bitmap, null, bounds, paint);
    }
    @Override public boolean performClick() { super.performClick(); click.run(); return true; }
    @Override public boolean onTouchEvent(MotionEvent event) {
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
            startX = event.getRawX(); startY = event.getRawY(); downAt = System.currentTimeMillis();
            int[] location = new int[2]; getLocationOnScreen(location); originX = location[0]; originY = location[1]; return true;
        }
        float dx = event.getRawX() - startX, dy = event.getRawY() - startY;
        if (event.getActionMasked() == MotionEvent.ACTION_MOVE) { drag.move(originX + Math.round(dx), originY + Math.round(dy), false); return true; }
        if (event.getActionMasked() == MotionEvent.ACTION_UP) {
            float threshold = 10 * getResources().getDisplayMetrics().density;
            if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
                if (System.currentTimeMillis() - downAt > 650) hide.run(); else performClick();
            } else drag.move(originX + Math.round(dx), originY + Math.round(dy), true);
            return true;
        }
        if (event.getActionMasked() == MotionEvent.ACTION_CANCEL) { drag.move(originX + Math.round(dx), originY + Math.round(dy), true); return true; }
        return true;
    }
    void dispose() { idle.cancel(); if (bitmap != null) bitmap.recycle(); bitmap = null; }
}
