import fs from 'fs';
let settings = fs.readFileSync('frontend/src/pages/SettingsPage.tsx', 'utf8');

settings = settings.replace(/configData\.security\.sandbox\?\.enabled/g, "(configData.security as any).sandbox?.enabled");
settings = settings.replace(/configData\.security\.api\?\.allow_static_pats/g, "(configData.security as any).api?.allow_static_pats");

fs.writeFileSync('frontend/src/pages/SettingsPage.tsx', settings);
