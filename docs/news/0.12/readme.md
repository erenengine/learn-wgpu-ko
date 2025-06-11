# 0.12 버전 업데이트!

이번 릴리즈에는 변경 사항이 많지 않아 마이그레이션이 그리 어렵지 않았습니다.

## 멀티뷰(Multi view) 추가

이제 `RenderPipelineDescriptor`에 `multiview` 필드가 포함됩니다. 이 필드는 배열 텍스처를 렌더 어태치먼트(render attachment)로 사용할 경우, 해당 배열 텍스처의 수를 나타냅니다.

## block 속성 제거

WGSL 명세가 변경되어 `block` 속성이 사라졌습니다. 이는 이제 WGSL의 `struct`를 유니폼 입력으로 사용하기 위해 별도의 어노테이션을 붙일 필요가 없다는 의미입니다. 예를 들어:

```wgsl
[[block]]
struct Camera {
    view_pos: vec4<f32>,
    view_proj: mat4x4<f32>,
}
```

위 코드는 아래와 같이 간단하게 바꿀 수 있습니다.

```wgsl
struct Camera {
    view_pos: vec4<f32>,
    view_proj: mat4x4<f32>,
}
```

## 더 강화된 유효성 검사

이제 Wgpu에 유효성 검사가 추가되어, 유니폼이 셰이더에 명시된 정렬(alignment)과 일치하지 않으면 그리기를 시도할 때 프로그램이 중단됩니다.

```
thread 'main' panicked at 'wgpu error: Validation Error

Caused by:
    In a RenderPass
      note: encoder = `Render Encoder`
    In a draw command, indexed:true indirect:false
      note: render pipeline = `Render Pipeline`
    Buffer is bound with size 28 where the shader expects 32 in group[1] compact index 0
```

제가 변경해야 했던 구조체는 `LightUniform`이 유일했습니다. 패딩 필드를 추가하기만 하면 되었습니다.

```rust
#[repr(C)]
#[derive(Debug, Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
struct LightUniform {
    position: [f32; 3],
    // 유니폼은 16바이트(float 4개) 간격으로 정렬되어야 하므로, 여기에 패딩 필드를 사용해야 합니다.
    _padding: u32,
    color: [f32; 3],
    // 유니폼은 16바이트(float 4개) 간격으로 정렬되어야 하므로, 여기에 패딩 필드를 사용해야 합니다.
    _padding2: u32,
}
```

이 변경 사항을 반영하기 위해 [조명 튜토리얼](../../intermediate/tutorial10-lighting)을 업데이트했습니다.

## 기타

최근 `anyhow` 라이브러리 배포에서 글로브 임포트(glob import, 예: `use anyhow::*`)가 깨지는 문제가 발생하여, 정규화된(qualified) 임포트(예: `anyhow::Result`)를 사용하도록 코드를 변경해야 했습니다. 이 문제는 주로 일부 쇼케이스 예제의 빌드 스크립트에서 발생했습니다.

메인 튜토리얼 예제는 영향을 받지 않았으며 변경 사항도 미미합니다. 궁금하시다면 언제든 저장소를 확인해 보세요.
