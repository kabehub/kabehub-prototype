package com.kabehub.app;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Capacitorコアが初期化パス完了後にwindow insets/status bar状態を
        // 再設定するケースがあるため、レイアウト確定後に遅延実行して上書きを回避する
        getWindow().getDecorView().post(() -> {
            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            // false = ライトコンテンツ（白系アイコン）。アプリの背景がダーク基調のため。
            controller.setAppearanceLightStatusBars(false);
        });
    }
}
