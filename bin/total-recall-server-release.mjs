#!/usr/bin/env node
import { main } from '../src/core/server-release.mjs';

process.exitCode = await main(process.argv.slice(2));
