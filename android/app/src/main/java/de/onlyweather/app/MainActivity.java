package de.onlyweather.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import de.onlyweather.app.widget.WidgetPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Eigene Plugins vor super.onCreate() registrieren, damit die Bridge sie kennt.
        registerPlugin(WidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
