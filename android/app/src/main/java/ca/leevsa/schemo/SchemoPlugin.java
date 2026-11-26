package ca.leevsa.schemo;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

// Fichiers de Schémo sur Android : ouvrir / enregistrer par le sélecteur de documents du système,
// fichier reçu au lancement (« Ouvrir avec »), téléchargement et installation d'une mise à jour.
@CapacitorPlugin(name = "Schemo")
public class SchemoPlugin extends Plugin {

    private static final int FLAGS = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;

    // fichier reçu par un Intent (au lancement ou plus tard)
    private static Uri pendingUri = null;
    private static SchemoPlugin instance = null;

    @Override
    public void load() {
        instance = this;
    }

    static void received(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction()) || intent.getData() == null) return;
        Uri uri = intent.getData();
        if (instance != null && instance.bridge != null && instance.hasListeners("openFile")) {
            JSObject ev = new JSObject();
            ev.put("uri", uri.toString());
            instance.notifyListeners("openFile", ev);
        } else {
            pendingUri = uri;
        }
    }

    // ---------- outils ----------

    private String nameOf(Uri uri) {
        String name = null;
        try (Cursor c = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) name = c.getString(0);
        } catch (Exception ignored) { }
        if (name == null) name = uri.getLastPathSegment();
        return name == null ? "diagramme.schemo" : name;
    }

    private String readText(Uri uri) throws Exception {
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            if (in == null) throw new Exception("lecture impossible");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }

    private void write(Uri uri, String data, boolean base64) throws Exception {
        byte[] bytes = base64 ? Base64.decode(data, Base64.DEFAULT) : data.getBytes(StandardCharsets.UTF_8);
        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (out == null) throw new Exception("écriture impossible");
            out.write(bytes);
        }
    }

    private void keep(Uri uri) {
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, FLAGS);
        } catch (Exception ignored) { }
    }

    // ---------- ouvrir ----------

    @PluginMethod
    public void open(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*"); // .schemo n'a pas de type connu d'Android
        intent.addFlags(FLAGS | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "opened");
    }

    @ActivityCallback
    private void opened(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.resolve(new JSObject());
            return;
        }
        Uri uri = result.getData().getData();
        keep(uri);
        try {
            JSObject r = new JSObject();
            r.put("uri", uri.toString());
            r.put("name", nameOf(uri));
            r.put("content", readText(uri));
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void read(PluginCall call) {
        try {
            Uri uri = Uri.parse(call.getString("uri"));
            JSObject r = new JSObject();
            r.put("uri", uri.toString());
            r.put("name", nameOf(uri));
            r.put("content", readText(uri));
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void startupFile(PluginCall call) {
        JSObject r = new JSObject();
        if (pendingUri != null) {
            r.put("uri", pendingUri.toString());
            pendingUri = null;
        }
        call.resolve(r);
    }

    // ---------- enregistrer ----------

    @PluginMethod
    public void write(PluginCall call) {
        try {
            Uri uri = Uri.parse(call.getString("uri"));
            write(uri, call.getString("data", ""), call.getBoolean("base64", false));
            JSObject r = new JSObject();
            r.put("uri", uri.toString());
            r.put("name", nameOf(uri));
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void create(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mime", "application/octet-stream"));
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "diagramme.schemo"));
        intent.addFlags(FLAGS | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "created");
    }

    @ActivityCallback
    private void created(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.resolve(new JSObject());
            return;
        }
        // le contenu est écrit ensuite par write() : passé ici, il serait gardé dans l'état de l'activité
        // pendant le sélecteur, et Android refuse plus de ~1 Mo (TransactionTooLargeException)
        Uri uri = result.getData().getData();
        keep(uri);
        JSObject r = new JSObject();
        r.put("uri", uri.toString());
        r.put("name", nameOf(uri));
        call.resolve(r);
    }

    // ---------- mise à jour : télécharger l'APK puis demander à Android de l'installer ----------

    @PluginMethod
    public void downloadUpdate(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) { call.reject("adresse invalide"); return; }
        call.setKeepAlive(true);
        new Thread(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "update");
                dir.mkdirs();
                File apk = new File(dir, "Schemo.apk");
                HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
                con.setInstanceFollowRedirects(true);
                con.setConnectTimeout(20000);
                con.setReadTimeout(30000);
                int code = con.getResponseCode();
                // GitHub renvoie vers un autre domaine : suivre à la main si besoin
                for (int i = 0; i < 5 && code >= 300 && code < 400; i++) {
                    String loc = con.getHeaderField("Location");
                    con.disconnect();
                    con = (HttpURLConnection) new URL(loc).openConnection();
                    con.setConnectTimeout(20000);
                    con.setReadTimeout(30000);
                    code = con.getResponseCode();
                }
                if (code != 200) throw new Exception("HTTP " + code);
                long total = con.getContentLengthLong();
                try (InputStream in = con.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[65536];
                    long done = 0;
                    int n, last = -1;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        done += n;
                        if (total > 0) {
                            int p = (int) (done * 100 / total);
                            if (p != last) {
                                last = p;
                                JSObject ev = new JSObject();
                                ev.put("percent", p);
                                notifyListeners("updateProgress", ev);
                            }
                        }
                    }
                }
                con.disconnect();
                call.resolve(new JSObject());
            } catch (Exception e) {
                call.reject(e.getMessage());
            } finally {
                call.setKeepAlive(false);
            }
        }).start();
    }

    @PluginMethod
    public void installUpdate(PluginCall call) {
        File apk = new File(new File(getContext().getCacheDir(), "update"), "Schemo.apk");
        if (!apk.exists()) { call.reject("aucune mise à jour téléchargée"); return; }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getActivity().startActivity(intent);
            call.resolve(new JSObject());
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    // ---------- divers ----------

    @PluginMethod
    public void info(PluginCall call) {
        JSObject r = new JSObject();
        r.put("sdk", Build.VERSION.SDK_INT);
        try {
            r.put("version", getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).versionName);
        } catch (Exception ignored) { }
        call.resolve(r);
    }

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) { call.reject("adresse invalide"); return; }
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getActivity().startActivity(intent);
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void exit(PluginCall call) {
        call.resolve(new JSObject());
        getActivity().finish();
    }
}
