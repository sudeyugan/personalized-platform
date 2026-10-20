package com.yiyu.mobile;

import android.app.AlertDialog;
import android.content.Context;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.json.*;

/** Approval lives in native encrypted storage, not WebView state. No generic write bridge exists. */
final class ConfigGrants {
    static final String ALIAS = "yiyu-config-grants-v1";
    private static JSONObject read(Context context) throws Exception {
        return SecretStore.existsRaw(context,ALIAS) ? new JSONObject(SecretStore.readRaw(context,ALIAS)) : new JSONObject();
    }
    private static String id(JSONArray bound) throws Exception { return bound.getString(1)+"/"+bound.getString(2); }
    private static JSONArray pin(JSONArray bound) throws Exception {
        return new JSONArray().put(bound.get(1)).put(bound.get(2)).put(bound.get(3)).put(bound.get(4)).put(bound.get(6)).put(bound.get(7));
    }
    static boolean approved(Context context, JSONArray bound) throws Exception {
        JSONObject value=read(context).optJSONObject(id(bound));
        return value!=null&&pin(bound).toString().equals(value.optString("pin",""));
    }
    static String key(Context context,JSONArray bound,String scope,String alias) throws Exception {
        if(!approved(context,bound))throw new Exception("native approval required");
        JSONObject value=read(context).getJSONObject(id(bound));
        return value.getBoolean("follow")?SecretStore.read(context,alias):value.getJSONObject("keys").getString(scope);
    }
    static void revoke(Context context,String text) throws Exception {
        JSONObject values=read(context);values.remove(id(ConfigHandoff.context(text)));
        SecretStore.saveRaw(context,ALIAS,values.toString(),null);
    }
    static boolean authorize(Context context,JSONObject input) throws Exception {
        String raw=input.getString("request"), text=input.getString("context");
        if(raw.length()>3000)throw new Exception("request limit");
        JSONObject request=new JSONObject(raw);JSONArray bound=ConfigHandoff.context(text);
        long expires=request.getLong("expires"),now=System.currentTimeMillis();
        if(!request.getString("space").equals(bound.getString(1)) || !request.getString("id").equals(bound.getString(2))
          || !request.getString("target").equals(bound.getString(4)) || !request.getJSONArray("scopes").toString().equals(bound.getJSONArray(6).toString())
          || !request.getString("publicKey").equals(bound.getString(7)) || expires<now || expires>now+610000)throw new Exception("binding invalid");
        if(approved(context,bound))return true;
        byte[] digest=MessageDigest.getInstance("SHA-256").digest(("[\"yiyu-config-v1\",\"request\","+raw+"]").getBytes(StandardCharsets.UTF_8));
        StringBuilder code=new StringBuilder();for(int i=0;i<6;i++){if(i>0&&i%2==0)code.append(" · ");code.append(String.format(java.util.Locale.ROOT,"%02x",digest[i]&255));}
        String name=request.optString("name","另一台设备").replaceAll("[\\p{Cc}\\p{Cf}]"," ");if(name.length()>60)name=name.substring(0,60);
        JSONArray scopes=bound.getJSONArray(6);StringBuilder range=new StringBuilder();for(int i=0;i<scopes.length();i++){if(i>0)range.append("、");range.append("model".equals(scopes.getString(i))?"DeepSeek对话":"ElevenLabs语音");}
        String message="请与新设备核对校验码：\n\n"+code+"\n\n设备："+name+"\n范围："+range+"\n\n将交接所选服务的 API Key。"+(request.getBoolean("follow")?"包含以后更新，可在设置停止。":"仅本次复制。")+"\n共用同一账户额度；不授予系统或浏览器权限。\n\n仅在校验码相同时批准。";
        if(!confirm(context,message)||System.currentTimeMillis()>expires)throw new Exception("cancelled or expired");
        JSONObject values=read(context);if(values.length()>=32&&!values.has(id(bound)))throw new Exception("approval limit");
        boolean follow=request.getBoolean("follow");JSONObject keys=new JSONObject();
        if(!follow)for(int i=0;i<scopes.length();i++){String scope=scopes.getString(i);keys.put(scope,SecretStore.read(context,"model".equals(scope)?SecretStore.MODEL:SecretStore.VOICE));}
        values.put(id(bound),new JSONObject().put("pin",pin(bound).toString()).put("follow",follow).put("keys",keys));SecretStore.saveRaw(context,ALIAS,values.toString(),null);return true;
    }
    private static boolean confirm(Context context,String message) throws Exception {
        if(!(context instanceof MainActivity))return false;
        MainActivity activity=(MainActivity)context;
        CountDownLatch done=new CountDownLatch(1);AtomicBoolean accepted=new AtomicBoolean(false);AtomicReference<AlertDialog> shown=new AtomicReference<>();
        activity.runOnUiThread(()->{
            if(activity.isFinishing()||activity.isDestroyed()||!activity.hasWindowFocus()){done.countDown();return;}
            AlertDialog dialog=new AlertDialog.Builder(activity).setTitle("一隅 · 批准配置交接").setMessage(message)
                .setPositiveButton("批准交接",(which,button)->accepted.set(true)).setNegativeButton("取消",null).create();
            shown.set(dialog);dialog.setOnDismissListener(which->done.countDown());dialog.show();
        });
        boolean finished=done.await(45,TimeUnit.SECONDS);
        activity.runOnUiThread(()->{AlertDialog dialog=shown.get();if(dialog!=null&&dialog.isShowing())dialog.dismiss();});
        return finished&&accepted.get()&&!activity.isFinishing()&&!activity.isDestroyed();
    }
}
