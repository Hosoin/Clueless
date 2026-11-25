package com.clueless.closet.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LoginSuccessController {

    @GetMapping(value = "/login/success", produces = "text/plain;charset=UTF-8")
    public String loginSuccess() {
        return "Google login successful";
    }
}
