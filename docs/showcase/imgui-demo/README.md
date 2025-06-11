# 기초 Imgui 데모

<div class="warning">

이 예제는 현재 작동하지 않습니다. 튜토리얼을 0.8 버전으로 마이그레이션하는 과정에서 `imgui_wgpu` 크레이트가 당시 0.7 버전에 머물러 있었기 때문에 이 예제가 뒤처지게 되었습니다. 그 이후로 업데이트하지 못했습니다. 고치는 것이 그리 어렵지는 않겠지만 (PR을 보내주셔도 좋습니다), 이 예제를 완전히 제거할까도 고려하고 있습니다.

이 튜토리얼은 wgpu (그리고 더 나아가 WebGPU 표준) 사용 방법에 중점을 둡니다. 저는 `wgpu`와 관련된(wgpu-adjacent) 크레이트 사용을 최소화하려고 합니다. 이러한 크레이트들은 이 튜토리얼을 최신 상태로 유지하는 데 방해가 될 수 있으며, 제가 사용하는 크레이트가 `wgpu` (또는 이 글을 쓰는 시점의 경우처럼 `winit`)의 다른 버전을 사용하여 마이그레이션을 계속할 수 없게 만드는 경우가 많습니다. 의존성 충돌 문제 외에도, 텍스트나 GUI처럼 기존 크레이트들이 구현하는 일부 주제들을 직접 다루고 싶습니다.

0.10 마이그레이션에서는 이 예제를 남겨두고, 쇼케이스 코드는 제외한 상태로 유지하겠습니다.

</div>

이 글은 Imgui 사용법에 대한 심층적인 가이드는 아닙니다. 하지만 시작하는 데 필요한 몇 가지 기초적인 내용들을 소개합니다. 우리는 [imgui-rs](https://docs.rs/imgui), [imgui-wgpu](https://docs.rs/imgui-wgpu), 그리고 [imgui-winit-support](https://docs.rs/imgui-winit-support)를 임포트해야 합니다.

```toml
imgui = "0.7"
imgui-wgpu = "25.0"
imgui-winit-support = "0.7"
```

<div class="note">

간결함을 위해 일부 의존성은 생략했습니다. 또한, 설정을 단순화하기 위해 쇼케이스용으로 만든 [framework 크레이트](https://github.com/sotrh/learn-wgpu/tree/master/code/showcase/framework)를 사용하고 있습니다. 코드에서 `display` 변수를 보신다면, 이는 `framework`에서 온 것입니다. `Display`는 `device`, `queue`, `swap_chain` 및 기타 기본적인 wgpu 객체들이 저장되는 곳입니다.

</div>

시작하려면 imgui와 `WinitPlatform`을 설정해야 합니다. 이 작업은 `winit::Window`를 생성한 후에 수행하세요.

```rust
let mut imgui = imgui::Context::create();
let mut platform = imgui_winit_support::WinitPlatform::init(&mut imgui);
platform.attach_window(
    imgui.io_mut(),
    &display.window,
    imgui_winit_support::HiDpiMode::Default,
);
imgui.set_ini_filename(None);
```

이제 기본 폰트를 설정해야 합니다. UI가 너무 크거나 작아지는 것을 방지하기 위해 창의 스케일 팩터(scale factor)를 사용할 것입니다.

```rust
let hidpi_factor = display.window.scale_factor();
let font_size = (13.0 * hidpi_factor) as f32;
imgui.io_mut().font_global_scale = (1.0 / hidpi_factor) as f32;
imgui.fonts().add_font(&[FontSource::DefaultFontData {
    config: Some(imgui::FontConfig {
        oversample_h: 1,
        pixel_snap_h: true,
        size_pixels: font_size,
        ..Default::default()
    }),
}]);
```

그다음 렌더러(renderer)를 생성해야 합니다. 제대로 작동하게 하려면 서피스(surface)의 `TextureFormat`을 사용해야 합니다.

```rust
let renderer_config = RendererConfig {
    texture_format: display.config.format,
    ..Default::default()
};
let renderer = Renderer::new(&mut imgui, &display.device, &display.queue, renderer_config);
```

씬(scene)을 업데이트할 때 imgui도 업데이트해야 합니다.

```rust
self.imgui.io_mut().update_delta_time(dt); // dt는 std::time::Duration 타입입니다
```

저는 imgui 전문가는 아니므로, 코드가 스스로 설명하도록 하겠습니다.

```rust
// UI 빌드
self.platform
    .prepare_frame(self.imgui.io_mut(), &display.window)
    .expect("Failed to prepare frame!");
let ui = self.imgui.frame();
{
    let window = imgui::Window::new(im_str!("Hello Imgui from WGPU!"));
    window
        .size([300.0, 100.0], Condition::FirstUseEver)
        .build(&ui, || {
            ui.text(im_str!("Hello world!"));
            ui.text(im_str!("This is a demo of imgui-rs using imgui-wgpu!"));
            ui.separator();
            let mouse_pos = ui.io().mouse_pos;
            ui.text(im_str!(
                "Mouse Position: ({:.1}, {:.1})",
                mouse_pos[0],
                mouse_pos[1],
            ));
        });
}

// 렌더링 준비
let mut encoder = display.device.create_command_encoder(&Default::default());
let output = match display.swap_chain.get_current_texture() {
    Ok(frame) => frame,
    Err(e) => {
        eprintln!("Error getting frame: {:?}", e);
        return;
    }
}.output;

// 씬 렌더링
self.canvas.render(
    &display.queue,
    &mut encoder,
    &output.view,
    display.config.width as f32,
    display.config.height as f32
);

// UI 렌더링
if self.last_cursor != ui.mouse_cursor() {
    self.last_cursor = ui.mouse_cursor();
    self.platform.prepare_render(&ui, &display.window);
}

let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
    label: Some("UI RenderPass"),
    color_attachments: &[wgpu::RenderPassColorAttachment {
        view: &output.view, // 원문 코드에 view, attachment 필드가 중복되어 있어 wgpu 0.8+ 기준으로 수정했습니다.
        resolve_target: None,
        ops: wgpu::Operations {
            load: wgpu::LoadOp::Load,
            store: wgpu::StoreOp::Store,
        },
    }],
    depth_stencil_attachment: None,
});
self.renderer
    .render(ui.render(), &display.queue, &display.device, &mut pass)
    .expect("Failed to render UI!");
drop(pass);

display.queue.submit(Some(encoder.finish()));
```

이게 전부입니다. 결과물은 다음과 같습니다!

![./screenshot.png](./screenshot.png)

<AutoGithubLink/>
