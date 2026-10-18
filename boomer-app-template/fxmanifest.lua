fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'boomer-app-template'
description 'Custom app template for the YSeries Boomer phone'
author 'TeamsGG Development'
version '1.0.0'

client_script 'client.lua'

-- The phone loads ui/index.html in its own iframe, so this resource has no ui_page.
files {
    'ui/index.html',
    'ui/style.css',
    'ui/app.js',
    'ui/icon.svg',
}

dependency 'yboomer-phone'
