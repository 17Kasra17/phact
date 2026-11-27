<?php

namespace Phact\Phact;

class PhactResponse extends Response
{
    private array $props;
    private string $pageName;

    public function __construct(string $pageName, array $props)
    {
        $this->pageName = $pageName;
        $this->props = $props;

        [$body, $status] = $this->render();

        parent::__construct($body, $status);
    }

    private function render(): array
    {
        $normalizedPage = trim(str_replace('\\', '/', $this->pageName), '/');

        if ($normalizedPage === '' || str_contains($normalizedPage, '..') || !preg_match('/^[A-Za-z0-9_\/-]+$/', $normalizedPage)) {
            return ['Invalid page name.', 400];
        }

        $distDir = realpath(Config::getPhactRootPath() . '/dist');
        if ($distDir === false) {
            return ['Page does not exist.', 404];
        }

        $relativePath = str_replace('/', DIRECTORY_SEPARATOR, strtoupper($normalizedPage) . '.php');
        $path = realpath($distDir . DIRECTORY_SEPARATOR . $relativePath);

        if ($path === false || !str_starts_with($path, $distDir . DIRECTORY_SEPARATOR) || !is_file($path)) {
            return ['Page does not exist.', 404];
        }

        require_once $path;

        $sanitizedFn = 'PHACT_PAGE_' . preg_replace('/[^A-Z0-9_]/', '_', strtoupper($normalizedPage));
        $legacyFn = strtoupper($normalizedPage);

        if (function_exists($sanitizedFn)) {
            $fn = $sanitizedFn;
        } elseif (function_exists($legacyFn)) {
            $fn = $legacyFn;
        } else {
            return ["Render function '{$sanitizedFn}' not found.", 500];
        }

        ob_start();
        $fn($this->props);
        $body = ob_get_clean();

        return [$body, 200];
    }
}
