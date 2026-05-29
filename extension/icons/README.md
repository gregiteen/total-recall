# Extension Icons

This directory should contain the following PNG icon files for the Total Recall Brain Extension:

| File            | Size    | Usage                                      |
|-----------------|---------|---------------------------------------------|
| `icon-16.png`   | 16×16   | Favicon, toolbar (small)                    |
| `icon-48.png`   | 48×48   | Extensions management page                  |
| `icon-128.png`  | 128×128 | Chrome Web Store, install dialog            |

## Requirements

- Format: PNG with transparency
- Design: Should match Total Recall branding (brain / recall motif)
- The manifest references these exact filenames — do not rename without updating `manifest.json`

## Generating placeholder icons

You can generate minimal placeholder PNGs with ImageMagick:

```bash
convert -size 16x16 xc:'#6366f1' icon-16.png
convert -size 48x48 xc:'#6366f1' icon-48.png
convert -size 128x128 xc:'#6366f1' icon-128.png
```

Replace these with proper branded icons before publishing.
