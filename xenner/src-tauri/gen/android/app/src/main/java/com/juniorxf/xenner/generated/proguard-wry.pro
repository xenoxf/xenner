# THIS FILE IS AUTO-GENERATED. DO NOT MODIFY!!

# Copyright 2020-2023 Tauri Programme within The Commons Conservancy
# SPDX-License-Identifier: Apache-2.0
# SPDX-License-Identifier: MIT

-keep class com.juniorxf.xenner.* {
  native <methods>;
}

-keep class com.juniorxf.xenner.WryActivity {
  public <init>(...);

  void setWebView(com.juniorxf.xenner.RustWebView);
  java.lang.Class getAppClass(...);
  int getId();
  java.lang.String getVersion();
  int startActivity(...);
}

-keep class com.juniorxf.xenner.Ipc {
  public <init>(...);

  @android.webkit.JavascriptInterface public <methods>;
}

-keep class com.juniorxf.xenner.RustWebView {
  public <init>(...);

  void loadUrlMainThread(...);
  void loadHTMLMainThread(...);
  void evalScript(...);
}

-keep class com.juniorxf.xenner.RustWebChromeClient,com.juniorxf.xenner.RustWebViewClient {
  public <init>(...);
}
