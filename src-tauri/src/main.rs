// DBX Desktop — 由异猫工作群（mutantcat.org）发行
// GitHub: https://github.com/Mutantcat-Working-Group
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    dbx_lib::run();
}
