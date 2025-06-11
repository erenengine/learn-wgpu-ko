# WGSL의 메모리 레이아웃

<div class="warn">

이 페이지는 현재 재작업 중입니다. 주제들을 좀 더 잘 이해하고 싶지만, 0.12 버전이 출시됨에 따라 현재까지 작업한 내용을 먼저 공개합니다.

</div>

## 정점(vertex) 및 인덱스(index) 버퍼의 정렬

정점 버퍼는 `VertexBufferLayout`을 정의해야 하므로, 메모리 정렬은 여러분이 WebGPU에 알려주는 값에 따라 결정됩니다. 이는 GPU의 메모리 사용량을 줄이는 데 매우 편리할 수 있습니다.

인덱스 버퍼는 `RenderEncoder::set_index_buffer()`에 전달하는 `IndexFormat`을 통해 지정한 기본 타입(primitive type)의 정렬을 사용합니다.

## Uniform 및 Storage 버퍼의 정렬

GPU는 수천 개의 픽셀을 병렬로 처리하도록 설계되었습니다. 이를 달성하기 위해 몇 가지 절충이 필요했습니다. 그래픽 하드웨어는 처리하려는 모든 바이트가 2의 거듭제곱으로 정렬되는 것을 선호합니다. 이것이 왜 그런지에 대한 정확한 세부 사항은 제 지식 수준을 넘어서지만, 셰이더가 작동하지 않는 이유를 해결(troubleshoot)하기 위해 이를 아는 것이 중요합니다.

<!-- 메모리 내 인스턴스 위치의 주소는 해당 인스턴스의 정렬 값의 배수여야 합니다. 일반적으로 정렬 값은 크기와 같습니다. 예외는 vec3, 구조체, 배열입니다. vec3는 vec4가 되도록 패딩(padding)이 추가되는데, 이는 마지막 요소를 사용하지 않는 vec4처럼 동작한다는 것을 의미합니다. -->

아래 표를 살펴보겠습니다.

---------------------------------------------------------------
| 타입                   | 정렬 (바이트)      | 크기 (바이트) |
|------------------------|--------------------|---------------|
| 스칼라 (i32, u32, f32) |                  4 |             4 |
| vec2&lt;T&gt;          |                  8 |             8 |
| vec3&lt;T&gt;          |             **16** |            12 |
| vec4&lt;T&gt;          |                 16 |            16 |

`vec3`의 경우, 정렬 값이 크기(12)에서 다음 2의 거듭제곱인 16인 것을 볼 수 있습니다. 이것은 그다지 직관적이지 않기 때문에 초보자(심지어 베테랑)들을 당황하게 만들 수 있습니다. 이는 우리가 구조체를 배치하기 시작할 때 특히 중요해집니다. [조명 튜토리얼](../../intermediate/tutorial10-lighting/#seeing-the-light)의 Light 구조체를 예로 들어보겠습니다.

[WGSL 사양의 4.3.7.1절](https://www.w3.org/TR/WGSL/#alignment-and-size)에서 전체 정렬 테이블을 볼 수 있습니다.

```wgsl
struct Light {
    position: vec3<f32>,
    color: vec3<f32>,
}
```

그렇다면 이 구조체의 정렬 값은 얼마일까요? 아마 개별 필드의 정렬 값을 모두 더한 값이라고 생각할 수 있습니다. Rust의 세계라면 그럴 수 있겠지만, 셰이더의 세계에서는 조금 더 복잡합니다. 주어진 구조체의 정렬은 다음 방정식으로 계산됩니다.

```
// S는 해당 구조체
// M은 구조체의 멤버
AlignOf(S) = max(AlignOfMember(S, M1), ... , AlignOfMember(S, Mn))
```

기본적으로, 구조체의 정렬은 해당 구조체 멤버들의 정렬 값 중 가장 큰 값입니다. 즉, 다음과 같습니다.

```
AlignOf(Light) 
    = max(AlignOfMember(Light, position), AlignOfMember(Light, color))
    = max(16, 16)
    = 16
```

이것이 바로 `LightUniform`에 패딩 필드가 있는 이유입니다. 데이터가 올바르게 정렬되지 않으면 WGPU는 이를 받아들이지 않습니다.

## 정렬 문제 처리 방법

일반적으로 보게 될 최대 정렬 값은 16입니다. 이 경우, 다음과 같이 할 수 있을 것이라고 생각할 수도 있습니다.

```rust
#[repr(C, align(16))]
#[derive(Debug, Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
struct LightUniform {
    position: [f32; 3],
    color: [f32; 3],
}
```

하지만 이것은 컴파일되지 않습니다. [bytemuck 크레이트](https://docs.rs/bytemuck/)는 암시적인 패딩 바이트가 있는 구조체에서는 작동하지 않습니다. Rust는 필드 사이의 메모리가 제대로 초기화되었음을 보장할 수 없습니다. 제가 이것을 시도했을 때 다음과 같은 오류가 발생했습니다.

```
error[E0512]: cannot transmute between types of different sizes, or dependently-sized types
   --> code/intermediate/tutorial10-lighting/src/main.rs:246:8
    |
246 | struct LightUniform {
    |        ^^^^^^^^^^^^
    |
    = note: 소스 타입: `LightUniform` (256 bits)
    = note: 타겟 타입: `_::{closure#0}::TypeWithoutPadding` (192 bits)
```

## 추가 자료

더 많은 정보를 찾고 있다면 @teoxoy가 작성한 [글](https://gist.github.com/teoxoy/936891c16c2a3d1c3c5e7204ac6cd76c)을 확인해 보세요.
