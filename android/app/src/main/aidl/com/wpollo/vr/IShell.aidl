package com.wpollo.vr;

// Serviço que roda com permissão de shell via Shizuku.
interface IShell {
    String exec(String cmd) = 1;
    void destroy() = 16777114; // id reservado pelo Shizuku para encerrar o serviço
}
