package com.example.WaffleBear.config;


import com.example.WaffleBear.config.interceptor.CheckRoomAuthInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {
    private final CheckRoomAuthInterceptor checkRoomAuthInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // 채팅방 상세 페이지 관련 API 호출 권한을 검사한다.
        registry.addInterceptor(checkRoomAuthInterceptor)
                .addPathPatterns("/chat/{id}/**");
    }
}