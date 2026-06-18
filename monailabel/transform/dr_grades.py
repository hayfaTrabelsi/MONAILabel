# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""
Diabetic Retinopathy (DR) grade definitions for fundus image classification.

This module defines the standard DR grading scale used in diabetic retinopathy
classification tasks. Each grade has a name, color code for visualization,
and severity level for classification purposes.

The grades follow the International Clinical DR Classification system:
- No DR (Level 0)
- Mild NPDR (Level 1)
- Moderate NPDR (Level 2)
- Severe NPDR (Level 3)
- Proliferative DR (Level 4)
"""

from typing import Dict, List, TypedDict
from dataclasses import dataclass
from enum import Enum


class DRGrade(str, Enum):
    """Enum for Diabetic Retinopathy grades."""
    NO_DR = "no_dr"
    MILD_NPDR = "mild_npdr"
    MODERATE_NPDR = "moderate_npdr"
    SEVERE_NPDR = "severe_npdr"
    PROLIFERATIVE_DR = "proliferative_dr"


@dataclass
class DRGradeInfo:
    """Information about a Diabetic Retinopathy grade."""
    name: str
    color: List[int]
    severity: int
    description: str


# DR grade definitions following the International Clinical DR Classification
DR_GRADES: Dict[str, DRGradeInfo] = {
    "no_dr": DRGradeInfo(
        name="no_dr",
        color=[0, 255, 0],  # Green
        severity=0,
        description="No Diabetic Retinopathy - No signs of DR"
    ),
    "mild_npdr": DRGradeInfo(
        name="mild_npdr",
        color=[255, 255, 0],  # Yellow
        severity=1,
        description="Mild Non-Proliferative DR - Small microaneurysms"
    ),
    "moderate_npdr": DRGradeInfo(
        name="moderate_npdr",
        color=[255, 165, 0],  # Orange
        severity=2,
        description="Moderate Non-Proliferative DR - More microaneurysms, venous changes"
    ),
    "severe_npdr": DRGradeInfo(
        name="severe_npdr",
        color=[255, 100, 0],  # Dark Orange
        severity=3,
        description="Severe Non-Proliferative DR - Significant vision-threatening changes"
    ),
    "proliferative_dr": DRGradeInfo(
        name="proliferative_dr",
        color=[255, 0, 0],  # Red
        severity=4,
        description="Proliferative Diabetic Retinopathy - Neovascularization"
    ),
}


# Reverse mapping from enum to grade info
DR_GRADE_ENUM_TO_INFO: Dict[DRGrade, DRGradeInfo] = {
    DRGrade.NO_DR: DR_GRADES["no_dr"],
    DRGrade.MILD_NPDR: DR_GRADES["mild_npdr"],
    DRGrade.MODERATE_NPDR: DR_GRADES["moderate_npdr"],
    DRGrade.SEVERE_NPDR: DR_GRADES["severe_npdr"],
    DRGrade.PROLIFERATIVE_DR: DR_GRADES["proliferative_dr"],
}


# List of all grades in order of severity
DR_GRADES_LIST: List[str] = list(DR_GRADES.keys())


# Mapping from grade to severity level
DR_SEVERITY_MAP: Dict[str, int] = {
    grade: info.severity for grade, info in DR_GRADES.items()
}


# Mapping from severity level to grade
DR_SEVERITY_TO_GRADE: Dict[int, str] = {
    info.severity: grade for grade, info in DR_GRADES.items()
}


def get_grade_info(grade: str) -> DRGradeInfo:
    """
    Get DR grade information by grade name.

    Args:
        grade: Grade name (e.g., "no_dr", "mild_npdr")

    Returns:
        DRGradeInfo object containing grade information

    Raises:
        KeyError: If the grade is not found
    """
    if grade not in DR_GRADES:
        raise KeyError(f"Unknown DR grade: {grade}. Available grades: {list(DR_GRADES.keys())}")
    return DR_GRADES[grade]


def get_grade_by_severity(severity: int) -> str:
    """
    Get DR grade by severity level.

    Args:
        severity: Severity level (0-4)

    Returns:
        Grade name

    Raises:
        KeyError: If the severity level is not found
    """
    if severity not in DR_SEVERITY_TO_GRADE:
        raise KeyError(f"Unknown severity level: {severity}. Available levels: {list(DR_SEVERITY_TO_GRADE.keys())}")
    return DR_SEVERITY_TO_GRADE[severity]


def get_all_grades() -> List[str]:
    """
    Get all available DR grades.

    Returns:
        List of all grade names
    """
    return DR_GRADES_LIST.copy()


def get_grades_with_severity() -> List[Dict[str, any]]:
    """
    Get all grades with their severity information.

    Returns:
        List of dictionaries containing grade information
    """
    return [
        {
            "name": info.name,
            "severity": info.severity,
            "color": info.color,
            "description": info.description,
        }
        for info in DR_GRADES.values()
    ]


def is_valid_grade(grade: str) -> bool:
    """
    Check if a grade is valid.

    Args:
        grade: Grade name to check

    Returns:
        True if the grade is valid, False otherwise
    """
    return grade in DR_GRADES


def get_severity_range() -> tuple:
    """
    Get the valid severity range.

    Returns:
        Tuple of (min_severity, max_severity)
    """
    return (0, 4)
