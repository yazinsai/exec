launchctl kickstart -k gui/$(id -u)/com.exec.agent
launchctl unload ~/Library/LaunchAgents/com.exec.desktop.plist &&      
  launchctl load ~/Library/LaunchAgents/com.exec.desktop.plist
