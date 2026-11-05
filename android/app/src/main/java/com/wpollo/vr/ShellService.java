package com.wpollo.vr;

import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Executado pelo Shizuku num processo com uid de shell: só roda comandos (am, input, settings). */
public class ShellService extends IShell.Stub {
    public ShellService() { }

    @Override
    public String exec(String cmd) {
        try {
            Process p = Runtime.getRuntime().exec(new String[]{"sh", "-c", cmd});
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()))) { String l; while ((l = r.readLine()) != null) sb.append(l).append('\n'); }
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getErrorStream()))) { String l; while ((l = r.readLine()) != null) sb.append(l).append('\n'); }
            p.waitFor();
            return sb.toString();
        } catch (Exception e) { return "erro: " + e.getMessage(); }
    }

    @Override
    public void destroy() { System.exit(0); }
}
