<?php
namespace Phact\Phact;

use Exception;

class Router
{
    public static function dispatch(): Response
    {
        $handler = Route::getRoutes()[Request::getMethod()][Request::getUri()] ?? null;

        if ($handler !== null) {
            $response = call_user_func($handler);
            if (!$response instanceof Response) {
                throw new Exception("Handler should return a Response");
            }
            return $response;
        }

        return new Response("404", 404);
    }
}
