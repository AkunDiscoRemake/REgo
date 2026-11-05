package com.wpollo.vr;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/** Serviço em primeiro plano exigido pelo Android 10+ para usar MediaProjection (displays virtuais dos apps). */
public class ProjectionService extends Service {
    @Override public IBinder onBind(Intent i) { return null; }
    @Override
    public int onStartCommand(Intent intent, int flags, int id) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel("apps", "Apps em janelas", NotificationManager.IMPORTANCE_LOW));
        Notification n = new Notification.Builder(this, "apps").setContentTitle("Wpollo VR").setContentText("Apps Android em janelas no VR")
                .setSmallIcon(android.R.drawable.ic_menu_view).build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION); else startForeground(1, n);
        return START_NOT_STICKY;
    }
}
