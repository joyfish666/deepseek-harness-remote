package dev.dsh.remote;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
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
    private static final String TAILSCALE_PACKAGE = "com.tailscale.ipn";
    private static final int REQUEST_FILE_CHOOSER = 1001;

    private WebView web;
    private LinearLayout webRoot;
    private LinearLayout errorView;
    private View vpnBanner;
    private String baseOrigin; // scheme://host[:port] of the configured entry
    private ValueCallback<Uri[]> fileChooserCallback;

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
        String url = prefs.getString(KEY_URL, null);
        if (url == null || url.trim().isEmpty()) {
            showSetup();
        } else {
            showWeb(url);
        }
    }

    // ── First-run setup ──────────────────────────────────────────────────
    private void showSetup() {
        setContentView(buildSetupView());
    }

    private View buildSetupView() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(24);
        root.setPadding(pad, dp(48), pad, pad);

        TextView title = new TextView(this);
        title.setText(R.string.app_name);
        title.setTextSize(24);
        root.addView(title);

        TextView hint = new TextView(this);
        hint.setText(R.string.setup_hint);
        hint.setTextSize(14);
        hint.setPadding(0, dp(12), 0, dp(12));
        root.addView(hint);

        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setHint(R.string.setup_url_hint);
        root.addView(input);

        Button connect = new Button(this);
        connect.setText(R.string.setup_connect);
        connect.setOnClickListener(v -> {
            String url = normalizeUrl(input.getText().toString().trim());
            if (url == null) {
                Toast.makeText(this, R.string.setup_url_invalid, Toast.LENGTH_SHORT).show();
                return;
            }
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_URL, url).apply();
            showWeb(url);
        });
        root.addView(connect);

        Button tailscale = new Button(this);
        tailscale.setText(R.string.setup_open_tailscale);
        tailscale.setOnClickListener(v -> openTailscale());
        root.addView(tailscale);

        return root;
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
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true); // chrome://inspect
        }
        webRoot.addView(web, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        errorView = null;
        setContentView(webRoot);
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
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
