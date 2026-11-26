package ca.leevsa.schemo;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SchemoPlugin.class);
        super.onCreate(savedInstanceState);
        SchemoPlugin.received(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        SchemoPlugin.received(intent);
    }
}
