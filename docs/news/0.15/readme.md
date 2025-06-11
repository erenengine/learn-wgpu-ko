# 0.15 버전으로 업데이트!

이번 업데이트는 이 튜토리얼에 대한 비교적 작은 규모의 업데이트이지만, 몇 가지 고려해야 할 사항이 있습니다.

1.  `TextureDescriptor`와 `SurfaceDescriptor`에 `view_formats` 필드가 추가되었습니다. 이 필드를 사용하면 `TextureView`를 생성할 때 사용할 수 있는 다양한 `TextureFormat`을 지정할 수 있습니다. 이 글을 쓰는 시점에서는, 이 기능은 거의 SRGB와 리니어(linear) 포맷 간의 전환만 가능하게 해줍니다. 예를 들면 다음과 같습니다.
    ```rust
    TextureDescriptor {
        // ...다른 필드들
        format: wgpu::TextureFormat::Rgba8UnormSrgb,
        view_formats: &[wgpu::TextureFormat::Rgba8Unorm],
    }
    ```
    `Texture`를 생성하는 데 사용된 포맷은 항상 지원되므로, 이를 `view_formats`에 따로 명시할 필요는 없습니다.

2.  `Surface`에서 지원하는 텍스처 포맷을 가져오는 방법이 변경되었습니다. 이전에는 `Vec<TextureFormat>`을 반환하는 `get_supported_formats()` 메서드가 있었습니다. 이제 `Surface`에는 `get_capabilities()` 메서드가 있습니다. 이 메서드는 지원되는 포맷과 더불어 몇 가지 다른 필드를 포함하는 `SurfaceCapabilities` 객체를 반환하며, 자세한 내용은 [여기](https://docs.rs/wgpu/latest/wgpu/struct.SurfaceCapabilities.html)에서 확인하실 수 있습니다. 튜토리얼에서는 다음과 같이 사용하고 있습니다.
    ```rust
    let surface_caps = surface.get_capabilities(&adapter);
    // 이 튜토리얼의 셰이더 코드는 Srgb 표면 텍스처를 가정합니다. 다른 포맷을 사용하면
    // 모든 색상이 더 어둡게 나옵니다. Srgb가 아닌 표면을 지원하려면,
    // 프레임에 그릴 때 이 점을 고려해야 합니다.
    let surface_format = surface_caps.formats.iter()
        .copied()
        .filter(|f| f.is_srgb())
        .next()
        .unwrap_or(surface_caps.formats[0]);
    let config = wgpu::SurfaceConfiguration {
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        format: surface_format,
        width: size.width,
        height: size.height,
        present_mode: surface_caps.present_modes[0],
        alpha_mode: surface_caps.alpha_modes[0],
        view_formats: vec![],
    };
    ```

언제나처럼, 제가 놓친 부분이 있다면 알려주세요. 0.15 버전의 전체 변경 로그는 [여기](https://github.com/gfx-rs/wgpu/blob/master/CHANGELOG.md#wgpu-0150-2023-01-25)에서 확인하실 수 있습니다.
