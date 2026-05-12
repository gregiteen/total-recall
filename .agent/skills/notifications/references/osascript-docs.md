# AppleScript `osascript` Reference

`osascript` is a command-line tool on macOS that executes AppleScript. 

For notifications, the standard syntax is:
```bash
osascript -e 'display notification "Hello World" with title "UltraChat"'
```

### Options:
- `display notification`: Triggers the native Notification Center banner.
- `with title`: Sets the bold header of the notification.
- `subtitle`: Optional secondary text below the title.

### Escaping
Quotes inside the message must be escaped to prevent bash evaluation errors:
`display notification "App \\"UltraChat\\" deployed"`
