package com.hydrateplus.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HydrateBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
