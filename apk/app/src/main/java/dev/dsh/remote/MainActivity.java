package dev.dsh.remote;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.ConnectivityManager.NetworkCallback;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import java.net.URI;
import java.net.URISyntaxException;

/**
 * dsh remote shell: hosts the dsh Web GUI in a WebView.
 *
 * The shell is a pure container: it loads the same URL the phone browser
 * would use (https://&lt;machine&gt;.&lt;tailnet&gt;.ts.net/), so the mobile-fit
 * adaptation layer and dsh's own trust fence apply unchanged. No dsh source
 * is touched; configuration/credential pages stay loopback-only (upstream
 * security design — the UI explains this itself).
 *
 * M1 scope: first-run URL setup, Tailscale (VPN) guidance, back-key
 * navigation, same-origin confinement (external links open in the browser),
 * file upload bridge, download manager, and an error screen with retry.
 * WebView debugging is enabled on debug builds (chrome://inspect).
 */
public final class MainActivity extends Activity {
    private static final String PREFS = "dsh-remote";
    private static final String KEY_URL = "url";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_KEEP_AWAKE = "keep-awake";
    private static final String TAILSCALE_PACKAGE = "com.tailscale.ipn";
    private static final int REQUEST_FILE_CHOOSER = 1001;

    private WebView web;
    private LinearLayout webRoot;
    private LinearLayout errorView;
    private View vpnBanner;
    private String baseOrigin; // scheme://host[:port] of the configured entry
    private ValueCallback<Uri[]> fileChooserCallback;
    private NetworkCallback vpnCallback;

    /**
     * JS bridge exposed to the page as window.DshShell. Only benign actions:
     * the mobile-fit gear button calls openSettings(). Nothing sensitive is
     * reachable from page scripts.
     */
    private final class ShellBridge {
        @JavascriptInterface
        public void openSettings() {
            runOnUiThread(() -> showSettings());
        }
    }

    private final WebViewClient client = new WebViewClient() {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (uri.getScheme() == null) return false;
            boolean http = uri.getScheme().equals("http") || uri.getScheme().equals("https");
            if (!http) {
                // mailto/tel/etc. belong to the system.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) { }
                return true;
            }
            if (baseOrigin != null && sameOrigin(uri.toString())) return false;
            // External navigation: open in the system browser, keep the shell.
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException ignored) { }
            return true;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            // Only the main frame decides the error screen; subresources fail
            // all the time (fonts, avatars) and must not flip the UI.
            if (request.isForMainFrame()) showError(error.getErrorCode());
        }
    };

    private final WebChromeClient chrome = new WebChromeClient() {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            fileChooserCallback = callback;
            Intent intent = params.createIntent();
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            try {
                startActivityForResult(intent, REQUEST_FILE_CHOOSER);
            } catch (ActivityNotFoundException e) {
                fileChooserCallback = null;
                Toast.makeText(MainActivity.this, R.string.no_file_picker, Toast.LENGTH_SHORT).show();
                return false;
            }
            return true;
        }
    };

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQUEST_FILE_CHOOSER && fileChooserCallback != null) {
            ValueCallback<Uri[]> callback = fileChooserCallback;
            fileChooserCallback = null;
            callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        applyKeepAwake(prefs.getBoolean(KEY_KEEP_AWAKE, false));
        String url = prefs.getString(KEY_URL, null);
        if (url == null || url.trim().isEmpty()) {
            showSetup();
        } else {
            showWeb(url);
        }
        watchVpn();
    }

    // ── First-run setup (dsh design style: dark card, brand mark, token) ─
    private static final int C_BG = 0xFF151517;
    private static final int C_CARD = 0xFF232324;
    private static final int C_INPUT = 0xFF2C2C2E;
    private static final int C_LABEL = 0xFFF9FAFB;
    private static final int C_LABEL_2 = 0xFFCFD3D6;
    private static final int C_LABEL_3 = 0xFFADAEB2;
    private static final int C_BORDER = 0x1FFFFFFF;
    private static final int C_BRAND = 0xFF4176E6;
    private static final int C_BRAND_HOVER = 0xFF679EFE;

    private GradientDrawable roundBg(int fill, int strokeColor, float radiusDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(fill);
        d.setCornerRadius(radiusDp * getResources().getDisplayMetrics().density);
        if (strokeColor != 0) d.setStroke(dp(1), strokeColor);
        return d;
    }

    private TextView styledLabel(String text) {
        TextView v = new TextView(this);
        v.setText(text);
        v.setTextSize(12);
        v.setTextColor(C_LABEL_2);
        v.setPadding(dp(4), 0, 0, dp(6));
        return v;
    }

    private EditText styledInput(String hint, boolean secret) {
        EditText v = new EditText(this);
        v.setSingleLine(true);
        v.setHint(hint);
        v.setHintTextColor(C_LABEL_3);
        v.setTextColor(C_LABEL);
        v.setTextSize(14);
        v.setPadding(dp(12), 0, dp(12), 0);
        v.setHeight(dp(40));
        v.setBackground(roundBg(C_INPUT, C_BORDER, 8));
        if (secret) v.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
        return v;
    }

    private Button primaryButton(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(14);
        b.setAllCaps(false);
        b.setTextColor(0xFFFFFFFF);
        b.setHeight(dp(40));
        b.setBackground(roundBg(C_BRAND, 0, 8));
        return b;
    }

    private Button ghostButton(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(14);
        b.setAllCaps(false);
        b.setTextColor(C_LABEL_2);
        b.setHeight(dp(40));
        b.setBackground(roundBg(C_INPUT, C_BORDER, 8));
        return b;
    }

    private void showSetup() {
        setContentView(buildSetupView());
    }

    private View buildSetupView() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(C_BG);
        scroll.setFillViewport(true);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(24);
        root.setPadding(pad, pad, pad, pad);

        // Brand row: app icon + name, like the proxy login page.
        LinearLayout brand = new LinearLayout(this);
        brand.setOrientation(LinearLayout.HORIZONTAL);
        brand.setGravity(android.view.Gravity.CENTER_VERTICAL);
        ImageView mark = new ImageView(this);
        mark.setImageResource(R.mipmap.ic_launcher);
        LinearLayout.LayoutParams markLp = new LinearLayout.LayoutParams(dp(32), dp(32));
        mark.setLayoutParams(markLp);
        brand.addView(mark);
        TextView title = new TextView(this);
        title.setText(R.string.app_name);
        title.setTextSize(15);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        title.setTextColor(C_LABEL);
        title.setPadding(dp(10), 0, 0, 0);
        brand.addView(title);
        root.addView(brand);

        TextView hint = new TextView(this);
        hint.setText(R.string.setup_hint);
        hint.setTextSize(12);
        hint.setTextColor(C_LABEL_3);
        hint.setLineSpacing(0, 1.4f);
        hint.setPadding(0, dp(10), 0, dp(16));
        root.addView(hint);

        root.addView(styledLabel(getString(R.string.setup_url_label)));
        EditText urlInput = styledInput(getString(R.string.setup_url_hint), false);
        root.addView(urlInput);

        root.addView(styledLabel(getString(R.string.setup_token_label)));
        EditText tokenInput = styledInput(getString(R.string.setup_token_hint), true);
        tokenInput.setText(getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_TOKEN, ""));
        root.addView(tokenInput);

        Button connect = primaryButton(getString(R.string.setup_connect));
        connect.setOnClickListener(v -> {
            String url = normalizeUrl(urlInput.getText().toString().trim());
            if (url == null) {
                Toast.makeText(this, R.string.setup_url_invalid, Toast.LENGTH_SHORT).show();
                return;
            }
            String token = tokenInput.getText().toString().trim();
            getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                    .putString(KEY_URL, url)
                    .putString(KEY_TOKEN, token)
                    .apply();
            showWeb(url);
        });
        root.addView(connect);

        Button tailscale = ghostButton(getString(R.string.setup_open_tailscale));
        tailscale.setOnClickListener(v -> openTailscale());
        root.addView(tailscale);

        scroll.addView(root);
        return scroll;
    }

    /** Pre-set the proxy token cookie so the WebView never sees /login. */
    private void applyTokenCookie(String url) {
        String token = getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_TOKEN, "");
        if (token.isEmpty()) return;
        String origin = originOf(url);
        if (origin == null) return;
        CookieManager.getInstance().setCookie(origin,
                "dsh_remote_config_token=" + Uri.encode(token) + "; Path=/; Max-Age=31536000");
    }

    // ── Main web view ────────────────────────────────────────────────────
    @SuppressLint("SetJavaScriptEnabled")
    private void showWeb(String url) {
        baseOrigin = originOf(url);
        webRoot = new LinearLayout(this);
        webRoot.setOrientation(LinearLayout.VERTICAL);

        vpnBanner = buildVpnBanner();
        webRoot.addView(vpnBanner);

        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true); // mobile-fit notice persistence
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);   // the page's viewport meta governs layout width
        settings.setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.setWebViewClient(client);
        web.setWebChromeClient(chrome);
        web.setDownloadListener(downloadListener);
        web.addJavascriptInterface(new ShellBridge(), "DshShell"); // mobile-fit gear
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true); // chrome://inspect
        }
        webRoot.addView(web, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        errorView = null;
        setContentView(webRoot);
        applyTokenCookie(url); // pre-set the proxy token so /login never shows
        web.loadUrl(url);
        refreshVpnBanner(webRoot);
    }

    private final DownloadListener downloadListener = (url, userAgent, contentDisposition, mimeType, contentLength) -> {
        Uri uri = Uri.parse(url);
        DownloadManager.Request request = new DownloadManager.Request(uri);
        request.setMimeType(mimeType);
        String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager != null) manager.enqueue(request);
    };

    // ── Settings (opened from the mobile-fit gear via the DshShell bridge) ─
    private void showSettings() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String current = prefs.getString(KEY_URL, "");

        ScrollView scroll = new ScrollView(this);
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(20);
        form.setPadding(pad, pad, pad, pad);
        scroll.addView(form);

        TextView urlLabel = new TextView(this);
        urlLabel.setText(R.string.settings_url);
        form.addView(urlLabel);

        EditText urlInput = new EditText(this);
        urlInput.setSingleLine(true);
        urlInput.setText(current);
        form.addView(urlInput);

        TextView tokenLabel = new TextView(this);
        tokenLabel.setText(R.string.settings_token);
        tokenLabel.setPadding(0, dp(12), 0, 0);
        form.addView(tokenLabel);

        EditText tokenInput = new EditText(this);
        tokenInput.setSingleLine(true);
        tokenInput.setText(prefs.getString(KEY_TOKEN, ""));
        form.addView(tokenInput);

        Button save = new Button(this);
        save.setText(R.string.settings_save);
        save.setOnClickListener(v -> {
            String url = normalizeUrl(urlInput.getText().toString().trim());
            if (url == null) {
                Toast.makeText(this, R.string.setup_url_invalid, Toast.LENGTH_SHORT).show();
                return;
            }
            prefs.edit()
                    .putString(KEY_URL, url)
                    .putString(KEY_TOKEN, tokenInput.getText().toString().trim())
                    .apply();
            if (web != null && webRoot != null) {
                baseOrigin = originOf(url);
                errorView = null;
                setContentView(webRoot);
                refreshVpnBanner(webRoot);
                applyTokenCookie(url);
                web.loadUrl(url);
            } else {
                showWeb(url);
            }
        });
        form.addView(save);

        Button clear = new Button(this);
        clear.setText(R.string.settings_clear);
        clear.setOnClickListener(v -> new AlertDialog.Builder(this)
                .setMessage(R.string.settings_clear_confirm)
                .setPositiveButton(R.string.settings_clear_yes, (d, w) -> clearWebData())
                .setNegativeButton(android.R.string.cancel, null)
                .show());
        form.addView(clear);

        Switch keepAwake = new Switch(this);
        keepAwake.setText(R.string.settings_keep_awake);
        keepAwake.setChecked(prefs.getBoolean(KEY_KEEP_AWAKE, false));
        keepAwake.setOnCheckedChangeListener((b, checked) -> {
            prefs.edit().putBoolean(KEY_KEEP_AWAKE, checked).apply();
            applyKeepAwake(checked);
        });
        form.addView(keepAwake);

        TextView about = new TextView(this);
        about.setText(getString(R.string.settings_about, BuildConfig.VERSION_NAME));
        about.setTextSize(12);
        about.setPadding(0, dp(16), 0, 0);
        form.addView(about);

        new AlertDialog.Builder(this)
                .setTitle(R.string.settings_title)
                .setView(scroll)
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    private void clearWebData() {
        if (web == null) return;
        web.clearCache(true);
        WebStorage.getInstance().deleteAllData();
        CookieManager.getInstance().removeAllCookies(null);
        String url = getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_URL, null);
        if (url != null) web.loadUrl(url);
    }

    private void applyKeepAwake(boolean on) {
        if (on) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }

    // ── VPN (Tailscale) guidance ─────────────────────────────────────────
    private View buildVpnBanner() {
        LinearLayout banner = new LinearLayout(this);
        banner.setOrientation(LinearLayout.HORIZONTAL);
        banner.setPadding(dp(12), dp(8), dp(12), dp(8));
        banner.setBackgroundColor(0xFFFFF3CD);

        TextView text = new TextView(this);
        text.setText(R.string.vpn_banner);
        text.setTextSize(13);
        text.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        banner.addView(text);

        Button open = new Button(this);
        open.setText(R.string.vpn_open);
        open.setOnClickListener(v -> openTailscale());
        banner.addView(open);
        return banner;
    }

    private void refreshVpnBanner(View root) {
        if (vpnBanner == null || root == null) return;
        String url = getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_URL, null);
        boolean loopback = url != null && isLoopbackHost(originOf(url));
        boolean hidden = loopback || hasVpnTransport();
        vpnBanner.setVisibility(hidden ? View.GONE : View.VISIBLE);
    }

    private boolean hasVpnTransport() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        Network[] networks = cm.getAllNetworks();
        for (Network network : networks) {
            NetworkCapabilities caps = cm.getNetworkCapabilities(network);
            if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return true;
        }
        return false;
    }

    /** Keep the guidance banner live while the VPN toggles. */
    private void watchVpn() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;
        NetworkRequest request = new NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_VPN)
                .build();
        vpnCallback = new NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                runOnUiThread(() -> refreshVpnBanner(webRoot));
            }

            @Override
            public void onLost(Network network) {
                runOnUiThread(() -> refreshVpnBanner(webRoot));
            }
        };
        cm.registerNetworkCallback(request, vpnCallback);
    }

    private void openTailscale() {
        Intent intent = new Intent(Intent.ACTION_VIEW,
                Uri.parse("market://details?id=" + TAILSCALE_PACKAGE));
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW,
                        Uri.parse("https://tailscale.com/download")));
            } catch (ActivityNotFoundException ignored) { }
        }
    }

    // ── Error screen ─────────────────────────────────────────────────────
    private void showError(int code) {
        if (errorView == null) {
            errorView = new LinearLayout(this);
            errorView.setOrientation(LinearLayout.VERTICAL);
            int pad = dp(24);
            errorView.setPadding(pad, dp(48), pad, pad);

            TextView title = new TextView(this);
            title.setText(R.string.error_title);
            title.setTextSize(18);
            errorView.addView(title);

            TextView detail = new TextView(this);
            detail.setText(R.string.error_detail);
            detail.setTextSize(14);
            detail.setPadding(0, dp(12), 0, dp(12));
            errorView.addView(detail);

            Button retry = new Button(this);
            retry.setText(R.string.error_retry);
            retry.setOnClickListener(v -> {
                String url = getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_URL, null);
                errorView = null;
                if (url != null && web != null && webRoot != null) {
                    // The error screen replaced the web root as the content
                    // view; put the web view back before reloading.
                    setContentView(webRoot);
                    refreshVpnBanner(webRoot);
                    web.loadUrl(url);
                }
            });
            errorView.addView(retry);

            Button reset = new Button(this);
            reset.setText(R.string.error_reset);
            reset.setOnClickListener(v -> {
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(KEY_URL).apply();
                errorView = null;
                if (web != null) {
                    web.destroy();
                    web = null;
                }
                webRoot = null;
                vpnBanner = null;
                showSetup();
            });
            errorView.addView(reset);
        }
        setContentView(errorView);
    }

    // ── Helpers ──────────────────────────────────────────────────────────
    private boolean sameOrigin(String url) {
        return baseOrigin != null && baseOrigin.equals(originOf(url));
    }

    /** scheme://host[:port] of a URL, or null when unparsable. */
    private static String originOf(String url) {
        try {
            URI uri = new URI(url);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (scheme == null || host == null) return null;
            int port = uri.getPort();
            return port < 0 ? scheme + "://" + host : scheme + "://" + host + ":" + port;
        } catch (URISyntaxException e) {
            return null;
        }
    }

    private static boolean isLoopbackHost(String origin) {
        if (origin == null) return false;
        String host = origin.replaceFirst("^[a-z]+://", "");
        int colon = host.indexOf(':');
        if (colon >= 0) host = host.substring(0, colon);
        return host.equals("localhost") || host.equals("[::1]") || host.startsWith("127.");
    }

    private static String normalizeUrl(String raw) {
        if (raw.isEmpty()) return null;
        String url = raw;
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "https://" + url;
        }
        try {
            URI uri = new URI(url);
            if (uri.getHost() == null) return null;
            return uri.toString();
        } catch (URISyntaxException e) {
            return null;
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        refreshVpnBanner(getWindow().getDecorView());
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onDestroy() {
        if (vpnCallback != null) {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null) cm.unregisterNetworkCallback(vpnCallback);
            vpnCallback = null;
        }
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
