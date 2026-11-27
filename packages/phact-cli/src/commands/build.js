import fs from 'fs';
import path from 'path';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {parse} from '@babel/parser';
import traverse from '@babel/traverse';
import register from '@babel/register';
import fsExtra from 'fs-extra';
import esbuild from 'esbuild';
import chalk from 'chalk';
import ora from 'ora';
import {Document} from '@phact-org/phact/document';
import {collectedHead, resetCollectedHead} from '@phact-org/phact/components';


const normalizePath = (filePath) => filePath.replace(/\\/g, '/');

function collectPages(dir, baseDir = dir) {
    const entries = fs.readdirSync(dir, {withFileTypes: true});
    const results = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectPages(fullPath, baseDir));
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (['.js', '.jsx'].includes(ext)) {
                const relPath = normalizePath(path.relative(baseDir, fullPath));
                results.push({
                    fullPath,
                    relName: relPath.slice(0, -ext.length),
                });
            }
        }
    }

    return results;
}

async function handler(argv) {
    console.log(chalk.cyan('Starting Phact build process...'));

    register({
        presets: [
            '@babel/preset-env',
            ['@babel/preset-react', {runtime: 'automatic'}]
        ],
        extensions: ['.js', '.jsx'],
        cache: true,
    });

    const phactConfigPath = path.join(process.cwd(), 'phact.config.json');
    let phactConfig;
    try {
        const phactConfigString = fs.readFileSync(phactConfigPath, 'utf-8');
        phactConfig = JSON.parse(phactConfigString);
    } catch (error) {
        console.error(`\n${chalk.red.bold('Error:')} Failed to load or parse ${chalk.yellow('phact.config.json')}.`);
        console.error(chalk.gray(error.message));
        process.exit(1);
    }

    const pagesPath = path.join(process.cwd(), phactConfig["pages"]);
    if (!fs.existsSync(pagesPath)) {
        console.error(`\n${chalk.red.bold('Error:')} The pages directory was not found.`);
        console.error(`  > Expected at: ${chalk.yellow(pagesPath)}`);
        process.exit(1);
    }

    const outputDir = path.join(process.cwd(), 'dist');
    const publicDir = path.join(process.cwd(), 'public');
    fsExtra.removeSync(outputDir);
    fs.mkdirSync(outputDir, {recursive: true});
    console.log(`Build directory ${chalk.yellow('dist/')} cleaned.`);

    const pages = collectPages(pagesPath);
    const buildSpinner = ora(`Found ${pages.length} pages to build. Starting...`).start();

    for (const {fullPath, relName} of pages) {
        buildSpinner.text = `Building page: ${chalk.cyan(relName)}`;

        try {
            const requirePath = normalizePath(fullPath);
            delete require.cache[require.resolve(requirePath)];
            const PageComponent = require(requirePath).default;

            if (!PageComponent) {
                buildSpinner.warn(chalk.yellow(`No default export in ${chalk.cyan(relName)}. Skipping.`));
                continue;
            }

            const jsxPropsTree = extractJsxPropsTree(fullPath);
            const appElement = <PageComponent props={jsxPropsTree}/>;

            resetCollectedHead();
            const appHtml = renderToString(appElement);
            const pageHead = [...collectedHead];
            resetCollectedHead();

            let documentHtml = renderToString(
                <Document pageName={relName} appHtml={appHtml} headElements={pageHead}/>
            );

            documentHtml = documentHtml.replace(/__PHACT_PLACEHOLDER_(.+?)__/g, (match, base64) => {
                const json = Buffer.from(base64, 'base64').toString('utf8');
                const parts = JSON.parse(json);
                const access = `$props${parts.map(p => `[${JSON.stringify(p)}]`).join('')}`;
                return `<?php echo htmlspecialchars((string)(${access} ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>`;
            });

            const phpFnName = 'PHACT_PAGE_' + relName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
            const finalPhpContent = `<?php function ${phpFnName}(array $props){ ?>${documentHtml}<?php } ?>`;
            const outPath = path.join(outputDir, `${relName.toUpperCase()}.php`);
            fs.mkdirSync(path.dirname(outPath), {recursive: true});
            fs.writeFileSync(outPath, finalPhpContent);

            const clientEntryContent = `
                import PageComponent from '${requirePath}';
                import { hydrate } from '${normalizePath(path.join(pagesPath, '../index.js'))}';
                
                hydrate(PageComponent);
            `;

            const jsOutPath = path.join(outputDir, `${relName}.js`);
            fs.mkdirSync(path.dirname(jsOutPath), {recursive: true});

            await esbuild.build({
                stdin: {
                    contents: clientEntryContent,
                    resolveDir: process.cwd(),
                    sourcefile: 'client-entry.js'
                },
                bundle: true,
                outfile: jsOutPath,
                platform: 'browser',
                format: 'iife',
                loader: {'.js': 'jsx'},
                sourcemap: true,
            });

            const publicJsPath = path.join(publicDir, `${relName}.js`);
            fs.mkdirSync(path.dirname(publicJsPath), {recursive: true});
            fs.copyFileSync(jsOutPath, publicJsPath);
            if (fs.existsSync(`${jsOutPath}.map`)) {
                fs.copyFileSync(`${jsOutPath}.map`, `${publicJsPath}.map`);
            }

        } catch (error) {
            buildSpinner.fail(chalk.red(`Failed to build page ${chalk.cyan(relName)}.`));
            console.error(chalk.gray(error.stack || error.message));
        }
    }

    buildSpinner.succeed(chalk.green.bold('Build completed successfully!'));
    console.log(`\nOutput files are in ${chalk.yellow('dist/')} and client bundles were copied to ${chalk.yellow('public/')}.`);
}

function extractJsxPropsTree(file) {
    const content = fs.readFileSync(file, 'utf8');
    const ast = parse(content, {
        sourceType: 'module',
        plugins: ['jsx']
    });

    const output = {};

    traverse(ast, {
        JSXExpressionContainer(astPath) {
            const expr = astPath.node.expression;

            if (expr.type === 'MemberExpression') {
                const parts = [];
                let current = expr;
                while (current.type === 'MemberExpression') {
                    if (current.property.type === 'Identifier') {
                        parts.unshift(current.property.name);
                    }
                    current = current.object;
                }

                if (current.type === 'Identifier' && current.name === 'props') {
                    let ref = output;
                    for (let i = 0; i < parts.length; i++) {
                        const key = parts[i];
                        if (i === parts.length - 1) {
                            ref[key] = '__PHACT_PLACEHOLDER_' + Buffer.from(JSON.stringify(parts)).toString('base64') + '__';
                        } else {
                            ref[key] = ref[key] || {};
                            ref = ref[key];
                        }
                    }
                }
            }
        }
    });

    return output;
}

export default {
    command: 'build',
    describe: 'Builds the Phact app for production',
    handler: handler
};
