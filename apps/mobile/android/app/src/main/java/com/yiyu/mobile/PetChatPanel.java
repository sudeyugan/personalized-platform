package com.yiyu.mobile;

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class PetChatPanel extends LinearLayout {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean disposed = false;
    PetChatPanel(Context context, Runnable close) {
        super(context); setOrientation(VERTICAL);
        int pad = Math.round(18 * getResources().getDisplayMetrics().density); setPadding(pad, pad, pad, pad);
        GradientDrawable paper = new GradientDrawable(); paper.setColor(Color.rgb(245, 241, 232)); paper.setCornerRadius(pad); setBackground(paper);
        LinearLayout header = new LinearLayout(context);
        TextView title = new TextView(context); title.setText("小鱼 · 陪你一会儿"); title.setTextColor(Color.DKGRAY); title.setTextSize(17);
        header.addView(title, new LayoutParams(0, LayoutParams.WRAP_CONTENT, 1));
        Button dismiss = new Button(context); dismiss.setText("收起"); dismiss.setOnClickListener(view -> close.run()); header.addView(dismiss); addView(header);
        ScrollView scroll = new ScrollView(context); TextView response = new TextView(context); response.setTextColor(Color.DKGRAY); response.setTextSize(15); response.setPadding(0, pad, 0, pad);
        response.setText("在这里说的话只发给手机配置的 DeepSeek，不会读取其他应用，也不会发到同步中枢。请先在一隅手机设置中配置密钥。"); scroll.addView(response); addView(scroll, new LayoutParams(LayoutParams.MATCH_PARENT, 0, 1));
        EditText input = new EditText(context); input.setHint("说点什么…"); input.setTextColor(Color.DKGRAY); input.setMaxLines(3); input.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(3000)}); addView(input);
        Button send = new Button(context); send.setText("发送给小鱼"); addView(send);
        send.setOnClickListener(view -> {
            String prompt = input.getText().toString().trim(); if (prompt.isEmpty()) return;
            send.setEnabled(false); response.setText("…");
            worker.execute(() -> {
                String result;
                try { result = ChatBackend.reply(context, prompt); }
                catch (Exception error) { result = "暂时未接通。请检查手机密钥与网络；没有执行电脑操作。"; }
                final String message = result;
                main.post(() -> { if (!disposed) { response.setText(message); send.setEnabled(true); input.setText(""); } });
            });
        });
    }
    void dispose() { disposed = true; worker.shutdownNow(); main.removeCallbacksAndMessages(null); }
}
