package com.clueless.closet.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TestController {

    private final String applicationName;

    public TestController(@Value("${spring.application.name}") String applicationName) {
        this.applicationName = applicationName;
    }

    @GetMapping(value = "/test", produces = "text/plain;charset=UTF-8")
    public String test() {
        return applicationName + " 테스트 요청";
    }
}
