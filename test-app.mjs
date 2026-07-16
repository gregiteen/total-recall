import fs from 'fs';
let content = fs.readFileSync('frontend/src/App.spec.tsx', 'utf8');
content = content.replace("screen.debug();\n      expect(screen.getByTestId('onboarding-page'))", "expect(screen.getByTestId('onboarding-page'))");
fs.writeFileSync('frontend/src/App.spec.tsx', content);
