fx_version "cerulean"
game "gta5"

title "YSeries - Custom App Template | React TS"
description "A template for creating custom apps for the YSeries Phones."
author "TeamsGG Development"

version '1.1.0'

client_script "client.lua"

shared_script "config.lua"

files {
    "ui/dist/**/*",
}

ui_page "ui/dist/index.html"
--ui_page "http://localhost:3000"
