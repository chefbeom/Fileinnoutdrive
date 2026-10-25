package com.example.WaffleBear.user.service;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class DemoAccountBootstrap implements ApplicationRunner {
    private final DemoAccountService demoAccountService;

    @Override
    public void run(ApplicationArguments args) {
        if (demoAccountService.isEnabled()) {
            demoAccountService.ensureDemoUser();
        }
    }
}