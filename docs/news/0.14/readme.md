# 0.14 버전으로 업데이트!

이 튜토리얼에 관한 한, API 측면에서는 큰 변화가 없습니다. 제가 적용해야 했던 변경 사항은 다음과 같습니다.

## `SurfaceConfiguration` 변경점

`SurfaceConfiguration`에 이제 `alpha_mode` 매개변수가 필요합니다. 아마 투명한 창을 지원하기 위한 것으로 보이지만, 자세히 살펴보지는 않았습니다. 코드 변경 사항은 미미합니다.
```rust
let config = wgpu::SurfaceConfiguration {
    usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
    format: surface.get_supported_formats(&adapter)[0],
    width: size.width,
    height: size.height,
    present_mode: wgpu::PresentMode::Fifo,
    alpha_mode: wgpu::CompositeAlphaMode::Auto, // 추가됨!
};
```

## Winit 업데이트

Winit이 "0.27" 버전으로 업데이트되었습니다. 따라서 리눅스에서 빌드하는 경우, 일부 패키지를 업데이트해야 할 수도 있습니다.

```bash
sudo apt install libfontconfig libfontconfig1-dev
```
