package com.example.WaffleBear.test;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/test")
public class TestController {

    @Value("${APP_VERSION:unknown}")
    private String appVersion;

    @Value("${POD_NAME:unknown}")
    private String podName;

    @GetMapping("/version")
    public Map<String, Object> version() {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("service", "backend");
        response.put("version", appVersion);
        response.put("podName", podName);
        response.put("timestamp", Instant.now().toString());
        return response;
    }
}
